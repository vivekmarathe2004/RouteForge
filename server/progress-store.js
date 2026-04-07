const { createSupabaseAdminClient } = require("./supabase");

function blankProgress() {
  return {
    completedQuizzes: [],
    bestScore: 0,
    subnetResults: [],
    completedLabs: [],
    recentQuizScores: [],
    labStepProgress: {}
  };
}

function requireSupabaseData(data, error, message) {
  if (error) {
    throw new Error(error.message || message);
  }
  return data;
}

async function upsertProfile(user) {
  const admin = createSupabaseAdminClient();
  const profile = {
    id: user.id,
    email: user.email || "",
    display_name: user.user_metadata && user.user_metadata.name
      ? String(user.user_metadata.name).trim()
      : (user.email || "RouteForge User"),
    updated_at: new Date().toISOString()
  };

  const { error } = await admin
    .from("profiles")
    .upsert(profile, { onConflict: "id" });

  if (error) {
    throw new Error(error.message || "Failed to sync profile.");
  }

  return profile;
}

async function buildProgressSnapshot(userId) {
  const admin = createSupabaseAdminClient();

  const [quizAttemptsRaw, subnetAttemptsRaw, labCompletionsRaw, labStepsRaw] = await Promise.all([
    admin
      .from("quiz_attempts")
      .select("level, score, total, percent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("subnet_attempts")
      .select("mode, difficulty, score, total, time_seconds, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("lab_completions")
      .select("lab_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("lab_step_progress")
      .select("lab_id, steps_json, updated_at")
      .eq("user_id", userId)
  ]);

  const quizAttempts = requireSupabaseData(quizAttemptsRaw.data, quizAttemptsRaw.error, "Failed to load quiz attempts.");
  const subnetAttempts = requireSupabaseData(subnetAttemptsRaw.data, subnetAttemptsRaw.error, "Failed to load subnet attempts.");
  const labCompletions = requireSupabaseData(labCompletionsRaw.data, labCompletionsRaw.error, "Failed to load lab completions.");
  const labSteps = requireSupabaseData(labStepsRaw.data, labStepsRaw.error, "Failed to load lab step progress.");

  const completedQuizzes = quizAttempts.map((row) => ({
    level: row.level,
    score: row.score,
    total: row.total,
    percent: row.percent,
    date: row.created_at
  }));

  const subnetResults = subnetAttempts.map((row) => ({
    mode: row.mode,
    difficulty: row.difficulty,
    score: row.score,
    total: row.total,
    timeSeconds: row.time_seconds,
    date: row.created_at
  }));

  const completedLabs = labCompletions.map((row) => row.lab_id);
  const recentQuizScores = completedQuizzes.slice(0, 8);
  const bestScore = completedQuizzes.reduce((max, item) => Math.max(max, item.percent), 0);
  const labStepProgress = {};

  labSteps.forEach((row) => {
    const steps = Array.isArray(row.steps_json) ? row.steps_json : [];
    labStepProgress[row.lab_id] = steps.map((item) => Boolean(item));
  });

  return {
    completedQuizzes,
    bestScore,
    subnetResults,
    completedLabs,
    recentQuizScores,
    labStepProgress
  };
}

async function saveQuizAttempt(userId, payload) {
  const admin = createSupabaseAdminClient();
  const percent = Math.round((payload.score / payload.total) * 100);

  const { error } = await admin
    .from("quiz_attempts")
    .insert({
      user_id: userId,
      level: payload.level,
      score: payload.score,
      total: payload.total,
      percent
    });

  if (error) {
    throw new Error(error.message || "Failed to save quiz attempt.");
  }

  return buildProgressSnapshot(userId);
}

async function saveSubnetAttempt(userId, payload) {
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("subnet_attempts")
    .insert({
      user_id: userId,
      mode: payload.mode,
      difficulty: payload.difficulty || null,
      score: payload.score,
      total: payload.total,
      time_seconds: Number.isFinite(payload.timeSeconds) ? payload.timeSeconds : null
    });

  if (error) {
    throw new Error(error.message || "Failed to save subnet attempt.");
  }

  return buildProgressSnapshot(userId);
}

async function saveLabCompletion(userId, labId) {
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("lab_completions")
    .upsert(
      {
        user_id: userId,
        lab_id: labId
      },
      {
        onConflict: "user_id,lab_id",
        ignoreDuplicates: true
      }
    );

  if (error) {
    throw new Error(error.message || "Failed to save lab completion.");
  }

  return buildProgressSnapshot(userId);
}

async function saveLabStepProgress(userId, labId, steps) {
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("lab_step_progress")
    .upsert(
      {
        user_id: userId,
        lab_id: labId,
        steps_json: steps,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_id,lab_id"
      }
    );

  if (error) {
    throw new Error(error.message || "Failed to save lab step progress.");
  }

  return buildProgressSnapshot(userId);
}

async function resetUserProgress(userId) {
  const admin = createSupabaseAdminClient();

  const [quizDelete, subnetDelete, labDelete, labStepDelete] = await Promise.all([
    admin.from("quiz_attempts").delete().eq("user_id", userId),
    admin.from("subnet_attempts").delete().eq("user_id", userId),
    admin.from("lab_completions").delete().eq("user_id", userId),
    admin.from("lab_step_progress").delete().eq("user_id", userId)
  ]);

  [quizDelete, subnetDelete, labDelete, labStepDelete].forEach((result) => {
    if (result.error) {
      throw new Error(result.error.message || "Failed to reset progress.");
    }
  });

  return blankProgress();
}

async function resetLabStepProgress(userId) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("lab_step_progress")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message || "Failed to reset lab step progress.");
  }

  return buildProgressSnapshot(userId);
}

module.exports = {
  blankProgress,
  upsertProfile,
  buildProgressSnapshot,
  saveQuizAttempt,
  saveSubnetAttempt,
  saveLabCompletion,
  saveLabStepProgress,
  resetLabStepProgress,
  resetUserProgress
};
