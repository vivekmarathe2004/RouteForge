const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const {
  blankProgress,
  upsertProfile,
  buildProgressSnapshot,
  saveQuizAttempt,
  saveSubnetAttempt,
  saveLabCompletion,
  saveLabStepProgress,
  resetLabStepProgress,
  resetUserProgress
} = require("./progress-store");
const {
  sanitizeUser,
  setSessionCookies,
  clearSessionCookies,
  attachSession,
  requireAuth
} = require("./auth");
const {
  createSupabaseAdminClient,
  createSupabaseAuthClient
} = require("./supabase");

const router = express.Router();
const dataDir = path.join(__dirname, "..", "data");

const fileMap = {
  ccnaTopics: "ccna-topics.json",
  ccnpTopics: "ccnp-topics.json",
  quizBank: "quiz-bank.json",
  labs: "labs.json",
  flashcards: "flashcards.json",
  cliCommands: "cli-commands.json",
  subnetQuestions: "subnet-questions.json"
};

async function readJson(fileName) {
  const fullPath = path.join(dataDir, fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickDailyQuestion(questions) {
  if (!questions.length) return null;

  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const start = Date.UTC(utcYear, 0, 0);
  const today = Date.UTC(utcYear, now.getUTCMonth(), now.getUTCDate());
  const dayOfYear = Math.floor((today - start) / 86400000);

  return questions[dayOfYear % questions.length];
}

function recommendTopics(progress, ccnaTopics, ccnpTopics) {
  const completedLevels = new Set((progress.completedQuizzes || []).map((quiz) => quiz.level));
  const hasAdvanced = completedLevels.has("CCNA advanced") || completedLevels.has("CCNP level");
  const labCount = (progress.completedLabs || []).length;

  if (labCount < 2) {
    return ["Subnetting", "VLAN", "Routing Fundamentals"];
  }

  if (!hasAdvanced) {
    return ["OSPF", "ACL", "NAT"];
  }

  return ccnpTopics.slice(0, 3).map((topic) => topic.title).concat(ccnaTopics.slice(0, 1).map((topic) => topic.title));
}

function trimText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function authErrorStatus(error, defaultStatus = 400) {
  const message = String((error && error.message) || "").toLowerCase();
  if (message.includes("already") || message.includes("exists") || message.includes("registered")) {
    return 409;
  }
  if (message.includes("invalid login") || message.includes("invalid") || message.includes("password")) {
    return 401;
  }
  return defaultStatus;
}

router.use(attachSession);

router.post("/auth/register", async (req, res) => {
  try {
    const name = trimText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (name.length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters." });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const admin = createSupabaseAdminClient();
    const authClient = createSupabaseAuthClient();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (createError || !created || !created.user) {
      return res.status(authErrorStatus(createError, 400)).json({
        error: (createError && createError.message) || "Failed to create account."
      });
    }

    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !signInData || !signInData.session || !signInData.user) {
      return res.status(500).json({
        error: (signInError && signInError.message) || "Account created but sign-in failed."
      });
    }

    await upsertProfile(signInData.user);
    setSessionCookies(res, signInData.session);
    return res.status(201).json({ user: sanitizeUser(signInData.user) });
  } catch (error) {
    console.error("register failed", error);
    return res.status(500).json({ error: error.message || "Failed to create account." });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!validateEmail(email) || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const authClient = createSupabaseAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data || !data.session || !data.user) {
      return res.status(authErrorStatus(error, 401)).json({
        error: (error && error.message) || "Invalid email or password."
      });
    }

    await upsertProfile(data.user);
    setSessionCookies(res, data.session);
    return res.json({ user: sanitizeUser(data.user) });
  } catch (error) {
    console.error("login failed", error);
    return res.status(500).json({ error: error.message || "Failed to sign in." });
  }
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookies(res);
  return res.status(204).send();
});

router.get("/auth/session", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not signed in." });
    }

    await upsertProfile(req.user);
    return res.json({ user: sanitizeUser(req.user) });
  } catch (error) {
    console.error("session lookup failed", error);
    clearSessionCookies(res);
    return res.status(401).json({ error: "Session expired." });
  }
});

router.get("/topics", async (req, res) => {
  try {
    const track = (req.query.track || "ccna").toLowerCase();
    if (track === "ccnp") {
      return res.json(await readJson(fileMap.ccnpTopics));
    }

    return res.json(await readJson(fileMap.ccnaTopics));
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load topics." });
  }
});

router.get("/topics/:id", async (req, res) => {
  try {
    const [ccna, ccnp] = await Promise.all([
      readJson(fileMap.ccnaTopics),
      readJson(fileMap.ccnpTopics)
    ]);

    const topic = [...ccna, ...ccnp].find((item) => item.id === req.params.id);
    if (!topic) {
      return res.status(404).json({ error: "Topic not found." });
    }

    return res.json(topic);
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load topic." });
  }
});

router.get("/quizzes", async (req, res) => {
  try {
    const questions = await readJson(fileMap.quizBank);
    const level = req.query.level;
    const count = Number.parseInt(req.query.count, 10) || 10;

    const pool = level ? questions.filter((question) => question.level === level) : questions;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    return res.json(shuffled.slice(0, clamp(count, 1, 40)));
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load quiz questions." });
  }
});

router.get("/quiz-bank", async (req, res) => {
  try {
    const questions = await readJson(fileMap.quizBank);
    const level = req.query.level;
    const topic = trimText(req.query.topic, 120).toLowerCase();
    const query = trimText(req.query.q, 120).toLowerCase();
    const page = Number.parseInt(req.query.page, 10) || 1;
    const pageSize = clamp(Number.parseInt(req.query.pageSize, 10) || 20, 5, 50);

    let pool = questions;
    if (level && level !== "all") {
      pool = pool.filter((question) => question.level === level);
    }

    if (topic) {
      pool = pool.filter((question) => String(question.topic || "").toLowerCase().includes(topic));
    }

    if (query) {
      pool = pool.filter((question) => {
        return (
          String(question.question || "").toLowerCase().includes(query) ||
          String(question.explanation || "").toLowerCase().includes(query) ||
          String(question.topic || "").toLowerCase().includes(query)
        );
      });
    }

    const total = pool.length;
    const safePage = Math.max(1, page);
    const start = (safePage - 1) * pageSize;

    return res.json({
      total,
      items: pool.slice(start, start + pageSize)
    });
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load question bank." });
  }
});

router.get("/daily-question", async (_req, res) => {
  try {
    return res.json(pickDailyQuestion(await readJson(fileMap.quizBank)));
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load daily question." });
  }
});

router.get("/subnet-questions", async (req, res) => {
  try {
    const questions = await readJson(fileMap.subnetQuestions);
    const difficulty = req.query.difficulty;
    return res.json(difficulty ? questions.filter((item) => item.difficulty === difficulty) : questions);
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load subnet questions." });
  }
});

router.get("/labs", async (_req, res) => {
  try {
    return res.json(await readJson(fileMap.labs));
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load labs." });
  }
});

router.get("/flashcards", async (_req, res) => {
  try {
    return res.json(await readJson(fileMap.flashcards));
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load flashcards." });
  }
});

router.get("/cli-commands", async (req, res) => {
  try {
    const commands = await readJson(fileMap.cliCommands);
    const query = trimText(req.query.q, 120).toLowerCase();

    if (!query) {
      return res.json(commands);
    }

    return res.json({
      commands: commands.commands.filter((entry) => {
        return entry.command.toLowerCase().includes(query) || entry.description.toLowerCase().includes(query);
      })
    });
  } catch (_error) {
    return res.status(500).json({ error: "Failed to load CLI commands." });
  }
});

router.get("/progress", async (req, res) => {
  try {
    return res.json(req.user ? await buildProgressSnapshot(req.user.id) : blankProgress());
  } catch (error) {
    console.error("progress load failed", error);
    return res.status(500).json({ error: error.message || "Failed to load progress." });
  }
});

router.post("/progress/quiz", requireAuth, async (req, res) => {
  try {
    const level = trimText(req.body.level, 80);
    const score = Number(req.body.score);
    const total = Number(req.body.total);

    if (!level || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid quiz payload." });
    }

    return res.json(await saveQuizAttempt(req.user.id, { level, score, total }));
  } catch (error) {
    console.error("quiz save failed", error);
    return res.status(500).json({ error: error.message || "Failed to save quiz progress." });
  }
});

router.post("/progress/subnet", requireAuth, async (req, res) => {
  try {
    const mode = trimText(req.body.mode, 40);
    const difficulty = trimText(req.body.difficulty, 40);
    const score = Number(req.body.score);
    const total = Number(req.body.total);
    const timeSeconds = req.body.timeSeconds === null || req.body.timeSeconds === undefined
      ? null
      : Number(req.body.timeSeconds);

    if (!mode || !Number.isFinite(score) || !Number.isFinite(total) || total < 0) {
      return res.status(400).json({ error: "Invalid subnet payload." });
    }

    return res.json(await saveSubnetAttempt(req.user.id, {
      mode,
      difficulty,
      score,
      total,
      timeSeconds
    }));
  } catch (error) {
    console.error("subnet save failed", error);
    return res.status(500).json({ error: error.message || "Failed to save subnet progress." });
  }
});

router.post("/progress/lab", requireAuth, async (req, res) => {
  try {
    const labId = trimText(req.body.labId, 120);
    if (!labId) {
      return res.status(400).json({ error: "labId is required." });
    }

    return res.json(await saveLabCompletion(req.user.id, labId));
  } catch (error) {
    console.error("lab completion save failed", error);
    return res.status(500).json({ error: error.message || "Failed to save lab progress." });
  }
});

router.post("/progress/lab-steps", requireAuth, async (req, res) => {
  try {
    const labId = trimText(req.body.labId, 120);
    const steps = Array.isArray(req.body.steps) ? req.body.steps.map((step) => Boolean(step)) : null;

    if (!labId || !steps) {
      return res.status(400).json({ error: "labId and steps are required." });
    }

    return res.json(await saveLabStepProgress(req.user.id, labId, steps));
  } catch (error) {
    console.error("lab step save failed", error);
    return res.status(500).json({ error: error.message || "Failed to save lab step progress." });
  }
});

router.post("/progress/lab-steps/reset", requireAuth, async (req, res) => {
  try {
    return res.json(await resetLabStepProgress(req.user.id));
  } catch (error) {
    console.error("lab step reset failed", error);
    return res.status(500).json({ error: error.message || "Failed to reset lab step progress." });
  }
});

router.post("/progress/reset", requireAuth, async (req, res) => {
  try {
    return res.json(await resetUserProgress(req.user.id));
  } catch (error) {
    console.error("progress reset failed", error);
    return res.status(500).json({ error: error.message || "Failed to reset progress." });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const [progress, quizBank, ccnaTopics, ccnpTopics] = await Promise.all([
      req.user ? buildProgressSnapshot(req.user.id) : Promise.resolve(blankProgress()),
      readJson(fileMap.quizBank),
      readJson(fileMap.ccnaTopics),
      readJson(fileMap.ccnpTopics)
    ]);

    return res.json({
      studyProgress: {
        quizzesTaken: (progress.completedQuizzes || []).length,
        labsDone: (progress.completedLabs || []).length,
        subnetAttempts: (progress.subnetResults || []).length,
        bestQuizScore: progress.bestScore || 0
      },
      dailyQuestion: pickDailyQuestion(quizBank),
      recentQuizScores: progress.recentQuizScores || [],
      recommendedTopics: recommendTopics(progress, ccnaTopics, ccnpTopics),
      user: req.user ? sanitizeUser(req.user) : null
    });
  } catch (error) {
    console.error("dashboard failed", error);
    return res.status(500).json({ error: error.message || "Failed to load dashboard." });
  }
});

module.exports = router;
