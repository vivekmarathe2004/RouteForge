(function () {
  const page = document.body.dataset.page || "";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function initDashboard() {
    const dashboardRoot = document.getElementById("dashboard-root");
    if (!dashboardRoot || !window.ProgressAPI) return;

    try {
      const data = await window.ProgressAPI.fetchDashboard();
      const daily = data.dailyQuestion;

      document.getElementById("stat-quizzes").textContent = data.studyProgress.quizzesTaken;
      document.getElementById("stat-best").textContent = `${data.studyProgress.bestQuizScore}%`;
      document.getElementById("stat-subnet").textContent = data.studyProgress.subnetAttempts;
      document.getElementById("stat-labs").textContent = data.studyProgress.labsDone;

      const dailyEl = document.getElementById("daily-question");
      if (daily) {
        dailyEl.innerHTML = `
          <p><strong>${escapeHtml(daily.question)}</strong></p>
          <p class="muted">Topic: ${escapeHtml(daily.topic)} | Level: ${escapeHtml(daily.level)}</p>
          <p class="muted">Answer insight: ${escapeHtml(daily.explanation)}</p>
        `;
      } else {
        dailyEl.textContent = "No daily question available.";
      }

      const scoresEl = document.getElementById("recent-scores");
      const scores = data.recentQuizScores || [];
      if (!scores.length) {
        scoresEl.innerHTML = "<p class='muted'>No quiz attempts yet.</p>";
      } else {
        scoresEl.innerHTML = scores
          .map((item) => `<div class="card"><strong>${escapeHtml(item.level)}</strong><p class="muted">${item.score}/${item.total} (${item.percent}%)</p><p class="muted">${escapeHtml(window.ProgressAPI.formatDate(item.date))}</p></div>`)
          .join("");
      }

      const recEl = document.getElementById("recommended-topics");
      recEl.innerHTML = (data.recommendedTopics || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    } catch (error) {
      dashboardRoot.innerHTML = `<div class="card"><p class="status-bad">${escapeHtml(error.message)}</p></div>`;
    }
  }

  function bindResetProgress() {
    const btn = document.getElementById("reset-progress");
    if (!btn || !window.ProgressAPI) return;

    btn.addEventListener("click", async () => {
      if (!confirm("Reset all quiz, subnet, and lab progress?")) return;
      await window.ProgressAPI.resetProgress();
      window.location.reload();
    });
  }

  function bindShortcuts() {
    const shortcuts = {
      d: "index.html",
      l: "learn.html",
      q: "quizzes.html",
      s: "subnet-trainer.html",
      c: "calculators.html",
      b: "labs.html",
      f: "flashcards.html",
      t: "cli-simulator.html",
      o: "topology-builder.html",
      h: "cheat-sheets.html"
    };

    document.addEventListener("keydown", (event) => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isTyping) return;

      if (event.altKey && shortcuts[event.key]) {
        window.location.href = shortcuts[event.key];
      }
    });
  }

  function bindSubnetShortcut() {
    const btn = document.getElementById("subnet-shortcut");
    if (!btn) return;
    btn.addEventListener("click", () => {
      window.location.href = "subnet-trainer.html";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (page === "dashboard") {
      initDashboard();
      bindResetProgress();
      bindSubnetShortcut();
    }
    bindShortcuts();
  });
})();
