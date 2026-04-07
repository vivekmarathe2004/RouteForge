(function () {
  const page = document.body.dataset.page || "";
  let authMode = "login";
  let authSubmitting = false;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function authElements() {
    return {
      navAuth: document.getElementById("nav-auth"),
      backdrop: document.getElementById("auth-modal-backdrop"),
      title: document.getElementById("auth-modal-title"),
      subtitle: document.getElementById("auth-modal-subtitle"),
      status: document.getElementById("auth-status"),
      form: document.getElementById("auth-form"),
      submit: document.getElementById("auth-submit"),
      nameRow: document.getElementById("auth-name-row"),
      name: document.getElementById("auth-name"),
      email: document.getElementById("auth-email"),
      password: document.getElementById("auth-password"),
      loginTab: document.getElementById("auth-tab-login"),
      registerTab: document.getElementById("auth-tab-register")
    };
  }

  function ensureAuthUi() {
    const nav = document.querySelector(".nav");
    if (!nav || document.getElementById("nav-auth")) return;

    const navAuth = document.createElement("div");
    navAuth.id = "nav-auth";
    navAuth.className = "nav-auth";
    nav.appendChild(navAuth);

    const backdrop = document.createElement("div");
    backdrop.id = "auth-modal-backdrop";
    backdrop.className = "auth-modal-backdrop is-hidden";
    backdrop.innerHTML = `
      <div class="auth-modal card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div class="lab-card-top">
          <div>
            <h3 id="auth-modal-title">Sign in</h3>
            <p id="auth-modal-subtitle" class="muted">Sync your progress across devices and deployments.</p>
          </div>
          <button type="button" data-auth-close>Close</button>
        </div>
        <div class="auth-tabs">
          <button type="button" id="auth-tab-login" class="chip is-active" data-auth-mode="login">Sign In</button>
          <button type="button" id="auth-tab-register" class="chip" data-auth-mode="register">Create Account</button>
        </div>
        <form id="auth-form" class="auth-form">
          <div id="auth-name-row">
            <label for="auth-name">Name</label>
            <input id="auth-name" autocomplete="name" maxlength="80" placeholder="Your name">
          </div>
          <div>
            <label for="auth-email">Email</label>
            <input id="auth-email" type="email" autocomplete="email" maxlength="255" placeholder="you@example.com" required>
          </div>
          <div>
            <label for="auth-password">Password</label>
            <input id="auth-password" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters" required>
          </div>
          <div id="auth-status" class="muted" aria-live="polite"></div>
          <div class="toolbar" style="margin-bottom:0;">
            <button type="submit" id="auth-submit" class="btn btn-primary">Sign In</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.hasAttribute("data-auth-close")) {
        closeAuthModal();
      }
    });

    const { form, loginTab, registerTab } = authElements();
    form.addEventListener("submit", handleAuthSubmit);
    loginTab.addEventListener("click", () => switchAuthMode("login"));
    registerTab.addEventListener("click", () => switchAuthMode("register"));
  }

  function switchAuthMode(nextMode) {
    authMode = nextMode === "register" ? "register" : "login";
    const ui = authElements();
    if (!ui.form) return;

    const isRegister = authMode === "register";
    ui.title.textContent = isRegister ? "Create account" : "Sign in";
    ui.subtitle.textContent = isRegister
      ? "Create a production account to store quiz, subnet, and lab progress in the database."
      : "Sign in to load your saved RouteForge progress.";
    ui.submit.textContent = isRegister ? "Create Account" : "Sign In";
    ui.nameRow.style.display = isRegister ? "" : "none";
    ui.name.required = isRegister;
    ui.loginTab.classList.toggle("is-active", !isRegister);
    ui.registerTab.classList.toggle("is-active", isRegister);
    ui.status.className = "muted";
    ui.status.textContent = "";
    ui.password.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
  }

  function openAuthModal(mode) {
    ensureAuthUi();
    switchAuthMode(mode || authMode);
    const ui = authElements();
    ui.backdrop.classList.remove("is-hidden");
    if (authMode === "register") {
      ui.name.focus();
    } else {
      ui.email.focus();
    }
  }

  function closeAuthModal() {
    const ui = authElements();
    if (!ui.backdrop) return;
    ui.backdrop.classList.add("is-hidden");
    ui.status.className = "muted";
    ui.status.textContent = "";
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (authSubmitting || !window.ProgressAPI) return;

    const ui = authElements();
    authSubmitting = true;
    ui.submit.disabled = true;
    ui.status.className = "muted";
    ui.status.textContent = authMode === "register" ? "Creating account..." : "Signing in...";

    try {
      if (authMode === "register") {
        await window.ProgressAPI.register({
          name: ui.name.value,
          email: ui.email.value,
          password: ui.password.value
        });
      } else {
        await window.ProgressAPI.login({
          email: ui.email.value,
          password: ui.password.value
        });
      }

      closeAuthModal();
      window.location.reload();
    } catch (error) {
      ui.status.className = "status-bad";
      ui.status.textContent = error.message;
    } finally {
      authSubmitting = false;
      ui.submit.disabled = false;
    }
  }

  function renderAuthNav(session) {
    const navAuth = document.getElementById("nav-auth");
    if (!navAuth) return;

    if (session && session.user) {
      navAuth.innerHTML = `
        <div class="auth-pill">
          <span class="chip auth-chip">Sync: ${escapeHtml(session.user.name)}</span>
          <button type="button" id="auth-logout-button">Sign Out</button>
        </div>
      `;

      navAuth.querySelector("#auth-logout-button").addEventListener("click", async () => {
        if (!window.ProgressAPI) return;
        try {
          await window.ProgressAPI.logout();
          window.location.reload();
        } catch (_error) {
          window.location.reload();
        }
      });
      return;
    }

    navAuth.innerHTML = `
      <div class="auth-pill">
        <span class="chip auth-chip">Guest mode</span>
        <button type="button" id="auth-login-button">Sign In</button>
        <button type="button" id="auth-register-button" class="btn btn-primary">Create Account</button>
      </div>
    `;

    navAuth.querySelector("#auth-login-button").addEventListener("click", () => openAuthModal("login"));
    navAuth.querySelector("#auth-register-button").addEventListener("click", () => openAuthModal("register"));
  }

  function renderDashboardAuthNotice(session) {
    if (page !== "dashboard") return;

    const dashboardRoot = document.getElementById("dashboard-root");
    if (!dashboardRoot) return;

    let notice = document.getElementById("dashboard-auth-notice");
    if (!notice) {
      notice = document.createElement("section");
      notice.id = "dashboard-auth-notice";
      notice.className = "card auth-callout";
      const hero = dashboardRoot.querySelector(".hero");
      if (hero && hero.nextSibling) {
        dashboardRoot.insertBefore(notice, hero.nextSibling);
      } else {
        dashboardRoot.prepend(notice);
      }
    }

    if (session && session.user) {
      notice.innerHTML = `
        <div class="lab-card-top">
          <div>
            <h3>Progress Sync Active</h3>
            <p class="muted">Signed in as ${escapeHtml(session.user.email)}. Quiz, subnet, and lab progress now persist in the database.</p>
          </div>
        </div>
      `;
      return;
    }

    notice.innerHTML = `
      <div class="lab-card-top">
        <div>
          <h3>Save Progress Across Devices</h3>
          <p class="muted">Browse the platform freely in guest mode, then create an account when you want production-ready progress sync.</p>
        </div>
        <div class="toolbar">
          <button type="button" id="dashboard-signin">Sign In</button>
          <button type="button" id="dashboard-register" class="btn btn-primary">Create Account</button>
        </div>
      </div>
    `;

    notice.querySelector("#dashboard-signin").addEventListener("click", () => openAuthModal("login"));
    notice.querySelector("#dashboard-register").addEventListener("click", () => openAuthModal("register"));
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
      recEl.innerHTML = (data.recommendedTopics || []).map((topic) => `<span class="chip">${escapeHtml(topic)}</span>`).join("");
    } catch (error) {
      dashboardRoot.innerHTML = `<div class="card"><p class="status-bad">${escapeHtml(error.message)}</p></div>`;
    }
  }

  function bindResetProgress() {
    const btn = document.getElementById("reset-progress");
    if (!btn || !window.ProgressAPI) return;

    btn.addEventListener("click", async () => {
      const session = await window.ProgressAPI.fetchSession();
      if (!session || !session.user) {
        openAuthModal("login");
        return;
      }

      if (!confirm("Reset all synced quiz, subnet, and lab progress?")) return;
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

  window.RouteForgeAuth = {
    open: openAuthModal
  };

  document.addEventListener("DOMContentLoaded", async () => {
    ensureAuthUi();
    switchAuthMode("login");
    bindShortcuts();

    let session = null;
    if (window.ProgressAPI) {
      session = await window.ProgressAPI.fetchSession();
      renderAuthNav(session);
      renderDashboardAuthNotice(session);
      window.ProgressAPI.onAuthChange((nextSession) => {
        renderAuthNav(nextSession);
        renderDashboardAuthNotice(nextSession);
      });
    }

    if (page === "dashboard") {
      initDashboard();
      bindResetProgress();
      bindSubnetShortcut();
    }
  });
})();
