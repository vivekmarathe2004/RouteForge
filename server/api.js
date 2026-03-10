const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();
const dataDir = path.join(__dirname, "..", "data");

const fileMap = {
  ccnaTopics: "ccna-topics.json",
  ccnpTopics: "ccnp-topics.json",
  quizBank: "quiz-bank.json",
  labs: "labs.json",
  flashcards: "flashcards.json",
  cliCommands: "cli-commands.json",
  subnetQuestions: "subnet-questions.json",
  progress: "progress.json"
};

async function readJson(fileName) {
  const fullPath = path.join(dataDir, fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function writeJson(fileName, data) {
  const fullPath = path.join(dataDir, fileName);
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), "utf8");
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
  const completedLevels = new Set((progress.completedQuizzes || []).map((q) => q.level));
  const hasAdvanced = completedLevels.has("CCNA advanced") || completedLevels.has("CCNP level");
  const labCount = (progress.completedLabs || []).length;

  if (labCount < 2) {
    return ["Subnetting", "VLAN", "Routing Fundamentals"];
  }

  if (!hasAdvanced) {
    return ["OSPF", "ACL", "NAT"];
  }

  return ccnpTopics.slice(0, 3).map((topic) => topic.title).concat(ccnaTopics.slice(0, 1).map((t) => t.title));
}

router.get("/topics", async (req, res) => {
  try {
    const track = (req.query.track || "ccna").toLowerCase();
    if (track === "ccnp") {
      const data = await readJson(fileMap.ccnpTopics);
      return res.json(data);
    }

    const data = await readJson(fileMap.ccnaTopics);
    return res.json(data);
  } catch (error) {
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
  } catch (error) {
    return res.status(500).json({ error: "Failed to load topic." });
  }
});

router.get("/quizzes", async (req, res) => {
  try {
    const questions = await readJson(fileMap.quizBank);
    const level = req.query.level;
    const count = Number.parseInt(req.query.count, 10) || 10;

    let pool = questions;
    if (level) {
      pool = questions.filter((q) => q.level === level);
    }

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return res.json(shuffled.slice(0, clamp(count, 1, 40)));
  } catch (error) {
    return res.status(500).json({ error: "Failed to load quiz questions." });
  }
});

router.get("/quiz-bank", async (req, res) => {
  try {
    const questions = await readJson(fileMap.quizBank);
    const level = req.query.level;
    const topic = (req.query.topic || "").trim().toLowerCase();
    const query = (req.query.q || "").trim().toLowerCase();
    const page = Number.parseInt(req.query.page, 10) || 1;
    const pageSize = clamp(Number.parseInt(req.query.pageSize, 10) || 20, 5, 50);

    let pool = questions;
    if (level && level !== "all") {
      pool = pool.filter((q) => q.level === level);
    }

    if (topic) {
      pool = pool.filter((q) => String(q.topic || "").toLowerCase().includes(topic));
    }

    if (query) {
      pool = pool.filter((q) => {
        return (
          String(q.question || "").toLowerCase().includes(query) ||
          String(q.explanation || "").toLowerCase().includes(query) ||
          String(q.topic || "").toLowerCase().includes(query)
        );
      });
    }

    const total = pool.length;
    const safePage = Math.max(1, page);
    const start = (safePage - 1) * pageSize;
    const items = pool.slice(start, start + pageSize);

    return res.json({ total, items });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load question bank." });
  }
});

router.get("/daily-question", async (req, res) => {
  try {
    const questions = await readJson(fileMap.quizBank);
    return res.json(pickDailyQuestion(questions));
  } catch (error) {
    return res.status(500).json({ error: "Failed to load daily question." });
  }
});

router.get("/subnet-questions", async (req, res) => {
  try {
    const questions = await readJson(fileMap.subnetQuestions);
    const difficulty = req.query.difficulty;
    if (!difficulty) {
      return res.json(questions);
    }

    return res.json(questions.filter((q) => q.difficulty === difficulty));
  } catch (error) {
    return res.status(500).json({ error: "Failed to load subnet questions." });
  }
});

router.get("/labs", async (req, res) => {
  try {
    const labs = await readJson(fileMap.labs);
    return res.json(labs);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load labs." });
  }
});

router.get("/flashcards", async (req, res) => {
  try {
    const cards = await readJson(fileMap.flashcards);
    return res.json(cards);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load flashcards." });
  }
});

router.get("/cli-commands", async (req, res) => {
  try {
    const commands = await readJson(fileMap.cliCommands);
    const query = (req.query.q || "").trim().toLowerCase();

    if (!query) {
      return res.json(commands);
    }

    const filtered = commands.commands.filter((entry) => {
      return (
        entry.command.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query)
      );
    });

    return res.json({ commands: filtered });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load CLI commands." });
  }
});

router.get("/progress", async (_req, res) => {
  try {
    const progress = await readJson(fileMap.progress);
    return res.json(progress);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load progress." });
  }
});

router.post("/progress/quiz", async (req, res) => {
  try {
    const { level, score, total } = req.body;

    if (!level || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid quiz payload." });
    }

    const progress = await readJson(fileMap.progress);
    const percent = Math.round((score / total) * 100);
    const record = {
      level,
      score,
      total,
      percent,
      date: new Date().toISOString()
    };

    progress.completedQuizzes = progress.completedQuizzes || [];
    progress.recentQuizScores = progress.recentQuizScores || [];

    progress.completedQuizzes.push(record);
    progress.recentQuizScores = [record, ...progress.recentQuizScores].slice(0, 8);
    progress.bestScore = Math.max(progress.bestScore || 0, percent);

    await writeJson(fileMap.progress, progress);
    return res.json(progress);
  } catch (error) {
    return res.status(500).json({ error: "Failed to save quiz progress." });
  }
});

router.post("/progress/subnet", async (req, res) => {
  try {
    const { mode, score, total, timeSeconds } = req.body;

    if (!mode || !Number.isFinite(score) || !Number.isFinite(total)) {
      return res.status(400).json({ error: "Invalid subnet payload." });
    }

    const progress = await readJson(fileMap.progress);
    progress.subnetResults = progress.subnetResults || [];

    progress.subnetResults.unshift({
      mode,
      score,
      total,
      timeSeconds: Number.isFinite(timeSeconds) ? timeSeconds : null,
      date: new Date().toISOString()
    });
    progress.subnetResults = progress.subnetResults.slice(0, 12);

    await writeJson(fileMap.progress, progress);
    return res.json(progress);
  } catch (error) {
    return res.status(500).json({ error: "Failed to save subnet progress." });
  }
});

router.post("/progress/lab", async (req, res) => {
  try {
    const { labId } = req.body;
    if (!labId) {
      return res.status(400).json({ error: "labId is required." });
    }

    const progress = await readJson(fileMap.progress);
    progress.completedLabs = progress.completedLabs || [];

    if (!progress.completedLabs.includes(labId)) {
      progress.completedLabs.push(labId);
    }

    await writeJson(fileMap.progress, progress);
    return res.json(progress);
  } catch (error) {
    return res.status(500).json({ error: "Failed to save lab progress." });
  }
});

router.post("/progress/reset", async (_req, res) => {
  try {
    const blank = {
      completedQuizzes: [],
      bestScore: 0,
      subnetResults: [],
      completedLabs: [],
      recentQuizScores: []
    };

    await writeJson(fileMap.progress, blank);
    return res.json(blank);
  } catch (error) {
    return res.status(500).json({ error: "Failed to reset progress." });
  }
});

router.get("/dashboard", async (_req, res) => {
  try {
    const [progress, quizBank, ccnaTopics, ccnpTopics] = await Promise.all([
      readJson(fileMap.progress),
      readJson(fileMap.quizBank),
      readJson(fileMap.ccnaTopics),
      readJson(fileMap.ccnpTopics)
    ]);

    const totalQuizzes = (progress.completedQuizzes || []).length;
    const labsDone = (progress.completedLabs || []).length;
    const subnetAttempts = (progress.subnetResults || []).length;

    const studyProgress = {
      quizzesTaken: totalQuizzes,
      labsDone,
      subnetAttempts,
      bestQuizScore: progress.bestScore || 0
    };

    return res.json({
      studyProgress,
      dailyQuestion: pickDailyQuestion(quizBank),
      recentQuizScores: progress.recentQuizScores || [],
      recommendedTopics: recommendTopics(progress, ccnaTopics, ccnpTopics)
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load dashboard." });
  }
});

module.exports = router;
