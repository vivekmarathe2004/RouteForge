(function () {
  const page = document.body.dataset.page || "";
  let authMode = "login";
  let authSubmitting = false;
  const navConfig = [
    {
      type: "link",
      label: "Dashboard",
      href: "index.html",
      pages: ["dashboard"]
    },
    {
      type: "group",
      label: "Learn",
      pages: ["learn", "flashcards", "cheat-sheets"],
      items: [
        { label: "Modules", href: "learn.html", description: "Structured CCNA and CCNP lessons." },
        { label: "Flashcards", href: "flashcards.html", description: "Quick recall for ports, protocols, and terms." },
        { label: "Cheat Sheets", href: "cheat-sheets.html", description: "Compact command and theory references." }
      ]
    },
    {
      type: "group",
      label: "Practice",
      pages: ["quizzes", "labs"],
      items: [
        { label: "Quizzes", href: "quizzes.html", description: "Timed questions, explanations, and score tracking." },
        { label: "Labs", href: "labs.html", description: "Hands-on guided scenarios with CLI workflows." }
      ]
    },
    {
      type: "group",
      label: "Tools",
      pages: ["subnet", "calculators", "cli-simulator", "topology"],
      items: [
        { label: "Subnet Trainer", href: "subnet-trainer.html", description: "Speed drills for addressing and masks." },
        { label: "Calculators", href: "calculators.html", description: "Network helpers for quick engineering math." },
        { label: "CLI Simulator", href: "cli-simulator.html", description: "Command practice with searchable references." },
        { label: "Topology Builder", href: "topology-builder.html", description: "Visual device layout and link planning." }
      ]
    }
  ];

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

  function renderNavigation() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const brand = nav.querySelector(".brand");
    if (brand) {
      brand.innerHTML = `
        <span class="brand-core">
          <span class="brand-mark">RF</span>
          <span class="brand-copy">
            <span class="brand-title">RouteForge</span>
            <span class="brand-subtitle">NetLab</span>
          </span>
        </span>
      `;
    }

    let navLinks = nav.querySelector(".nav-links");
    if (!navLinks) {
      navLinks = document.createElement("div");
      navLinks.className = "nav-links";
      if (brand && brand.nextSibling) {
        nav.insertBefore(navLinks, brand.nextSibling);
      } else {
        nav.appendChild(navLinks);
      }
    }

    navLinks.innerHTML = navConfig.map((entry, index) => {
      const isActive = entry.pages.includes(page);
      if (entry.type === "link") {
        return `<a class="nav-link ${isActive ? "active" : ""}" href="${entry.href}">${entry.label}</a>`;
      }

      const items = entry.items.map((item) => {
        const itemPage = item.href
          .replace(".html", "")
          .replace("subnet-trainer", "subnet")
          .replace("cli-simulator", "cli-simulator")
          .replace("topology-builder", "topology")
          .replace("cheat-sheets", "cheat-sheets");

        return `
          <a class="nav-menu-link ${itemPage === page ? "active" : ""}" href="${item.href}">
            <span class="nav-menu-title">${item.label}</span>
            <span class="nav-menu-copy">${item.description}</span>
          </a>
        `;
      }).join("");

      return `
        <div class="nav-group ${isActive ? "active" : ""}" data-nav-group="${index}">
          <button type="button" class="nav-group-trigger" aria-expanded="false">
            <span>${entry.label}</span>
            <span class="nav-group-caret" aria-hidden="true">+</span>
          </button>
          <div class="nav-menu" role="menu" aria-label="${entry.label}">
            ${items}
          </div>
        </div>
      `;
    }).join("");
  }

  function ensureAuthUi() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    let navAuth = document.getElementById("nav-auth");
    if (!navAuth) {
      navAuth = document.createElement("div");
      navAuth.id = "nav-auth";
      navAuth.className = "nav-auth";
      nav.appendChild(navAuth);
    }

    let backdrop = document.getElementById("auth-modal-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "auth-modal-backdrop";
      backdrop.className = "auth-modal-backdrop is-hidden";
      backdrop.innerHTML = `
        <div class="auth-modal card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <div class="lab-card-top auth-modal-head">
            <div class="auth-modal-copy">
              <h3 id="auth-modal-title">Sign in</h3>
              <p id="auth-modal-subtitle" class="muted">Sync your progress across devices and deployments.</p>
            </div>
            <button type="button" class="auth-close-btn" data-auth-close>Close</button>
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

  function bindAuthNavButtons() {
    const loginButton = document.getElementById("auth-login-button");
    const registerButton = document.getElementById("auth-register-button");
    const logoutButton = document.getElementById("auth-logout-button");

    if (loginButton && loginButton.dataset.bound !== "true") {
      loginButton.dataset.bound = "true";
      loginButton.addEventListener("click", () => openAuthModal("login"));
    }

    if (registerButton && registerButton.dataset.bound !== "true") {
      registerButton.dataset.bound = "true";
      registerButton.addEventListener("click", () => openAuthModal("register"));
    }

    if (logoutButton && logoutButton.dataset.bound !== "true") {
      logoutButton.dataset.bound = "true";
      logoutButton.addEventListener("click", async () => {
        if (!window.ProgressAPI) return;
        try {
          await window.ProgressAPI.logout();
          window.location.reload();
        } catch (_error) {
          window.location.reload();
        }
      });
    }
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
          <span class="auth-guest-label">Signed in as ${escapeHtml(session.user.name)}</span>
          <button type="button" id="auth-logout-button" class="auth-logout-btn">Sign Out</button>
        </div>
      `;
      bindAuthNavButtons();
      return;
    }

    navAuth.innerHTML = `
      <div class="auth-pill">
        <span class="auth-guest-label">Guest</span>
        <button type="button" id="auth-login-button" class="auth-login-btn">Sign In</button>
        <button type="button" id="auth-register-button" class="btn btn-primary auth-register-btn">Create Account</button>
      </div>
    `;
    bindAuthNavButtons();
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
    renderNavigation();
    ensureAuthUi();
    switchAuthMode("login");
    bindShortcuts();
    bindAuthNavButtons();

    let session = null;
    if (window.ProgressAPI) {
      try {
        session = await window.ProgressAPI.fetchSession();
      } catch (_error) {
        session = null;
      }
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
