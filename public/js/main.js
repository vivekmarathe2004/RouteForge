(function () {
  const page = document.body.dataset.page || "";
  let authMode = "login";
  let authStep = "credentials";
  let pendingOtpEmail = "";
  let authSubmitting = false;
  let capsLockToastVisible = false;
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

  function ensureToastUi() {
    let stack = document.getElementById("toast-stack");
    if (stack) return stack;

    stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    stack.setAttribute("aria-atomic", "true");
    document.body.appendChild(stack);
    return stack;
  }

  function showToast(message, tone = "info", timeout = 3600) {
    if (!message) return null;

    const stack = ensureToastUi();
    const toast = document.createElement("div");
    toast.className = `toast toast-${tone}`;
    toast.setAttribute("role", tone === "error" ? "alert" : "status");
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 220);
    }, timeout);

    return toast;
  }

  function authElements() {
    return {
      navAuth: document.getElementById("nav-auth"),
      backdrop: document.getElementById("auth-modal-backdrop"),
      title: document.getElementById("auth-modal-title"),
      subtitle: document.getElementById("auth-modal-subtitle"),
      form: document.getElementById("auth-form"),
      submit: document.getElementById("auth-submit"),
      nameRow: document.getElementById("auth-name-row"),
      name: document.getElementById("auth-name"),
      email: document.getElementById("auth-email"),
      password: document.getElementById("auth-password"),
      passwordToggle: document.getElementById("auth-password-toggle"),
      confirmRow: document.getElementById("auth-confirm-row"),
      confirm: document.getElementById("auth-confirm-password"),
      confirmToggle: document.getElementById("auth-confirm-toggle"),
      credentialsSection: document.getElementById("auth-credentials"),
      otpSection: document.getElementById("auth-otp-section"),
      otp: document.getElementById("auth-otp"),
      otpBack: document.getElementById("auth-otp-back"),
      otpResend: document.getElementById("auth-otp-resend"),
      loginTab: document.getElementById("auth-tab-login"),
      registerTab: document.getElementById("auth-tab-register")
    };
  }

  function setAuthStatus(message, tone = "muted") {
    const toastTone = tone === "status-bad" ? "error" : tone === "status-good" ? "success" : tone === "status-warn" ? "warning" : "info";
    showToast(message, toastTone);
  }

  function setInputError(input, hasError) {
    if (!input) return;
    input.classList.toggle("input-error", Boolean(hasError));
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
  }

  function clearAuthErrors() {
    const ui = authElements();
    [ui.name, ui.email, ui.password, ui.confirm].forEach((input) => setInputError(input, false));
    setInputError(ui.otp, false);
  }

  function setPasswordVisibility(input, toggle, visible) {
    if (!input || !toggle) return;
    input.type = visible ? "text" : "password";
    toggle.textContent = visible ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", visible ? "true" : "false");
  }

  function updateCapsLockState(event, forceHidden = false) {
    const isVisible = !forceHidden && Boolean(event && event.getModifierState && event.getModifierState("CapsLock"));
    if (isVisible && !capsLockToastVisible) {
      capsLockToastVisible = true;
      showToast("Caps Lock is on.", "warning", 2200);
    }
    if (!isVisible) {
      capsLockToastVisible = false;
    }
  }

  function updatePasswordUi() {
    const ui = authElements();
    if (!ui.password) return;

    const isRegister = authMode === "register";
    const isVerifyStep = authMode === "register" && authStep === "verify";

    if (ui.credentialsSection) {
      ui.credentialsSection.classList.toggle("is-hidden", isVerifyStep);
    }
    if (ui.otpSection) {
      ui.otpSection.classList.toggle("is-hidden", !isVerifyStep);
    }

    ui.confirmRow.style.display = isRegister && !isVerifyStep ? "" : "none";
    ui.confirm.required = isRegister && !isVerifyStep;
    ui.confirm.disabled = !isRegister || isVerifyStep;
    ui.nameRow.style.display = isRegister && !isVerifyStep ? "" : "none";
    ui.name.required = isRegister && !isVerifyStep;
    ui.submit.textContent = isVerifyStep ? "Verify Email" : (isRegister ? "Create Account" : "Sign In");
    if (ui.otpBack) {
      ui.otpBack.classList.toggle("is-hidden", !isVerifyStep);
    }
    if (ui.otpResend) {
      ui.otpResend.classList.toggle("is-hidden", !isVerifyStep);
    }
  }

  function setAuthStep(nextStep) {
    authStep = nextStep === "verify" ? "verify" : "credentials";
    updatePasswordUi();
    const ui = authElements();
    if (authMode === "register" && authStep === "verify") {
      const emailText = pendingOtpEmail || ui.email.value.trim();
      showToast(
        emailText
          ? `We sent a verification code to ${emailText}. Enter the code to finish creating your account.`
          : "We sent a verification code. Enter it to finish creating your account.",
        "info",
        4600
      );
    }
  }

  function resetOtpFlow() {
    pendingOtpEmail = "";
    const ui = authElements();
    if (ui.otp) {
      ui.otp.value = "";
    }
    setAuthStep("credentials");
  }

  function validateCredentialsForm() {
    const ui = authElements();
    const isRegister = authMode === "register";

    clearAuthErrors();

    if (isRegister && ui.name.value.trim().length < 2) {
      setInputError(ui.name, true);
      setAuthStatus("Name must be at least 2 characters.", "status-bad");
      ui.name.focus();
      return false;
    }

    if (!ui.email.value.trim() || !ui.email.validity.valid) {
      setInputError(ui.email, true);
      setAuthStatus("Enter a valid email address.", "status-bad");
      ui.email.focus();
      return false;
    }

    if (ui.password.value.length < 8) {
      setInputError(ui.password, true);
      setAuthStatus("Password must be at least 8 characters.", "status-bad");
      ui.password.focus();
      return false;
    }

    if (isRegister && ui.confirm.value !== ui.password.value) {
      setInputError(ui.confirm, true);
      setAuthStatus("Passwords do not match.", "status-bad");
      ui.confirm.focus();
      return false;
    }

    return true;
  }

  function validateOtpForm() {
    const ui = authElements();
    const token = ui.otp.value.trim();

    clearAuthErrors();

    if (!token || token.length < 6) {
      setInputError(ui.otp, true);
      setAuthStatus("Enter the verification code from your email.", "status-bad");
      ui.otp.focus();
      return false;
    }

    return true;
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
            <div id="auth-credentials">
              <div id="auth-name-row">
                <label for="auth-name">Name</label>
                <input id="auth-name" autocomplete="name" maxlength="80" placeholder="Your name">
              </div>
              <div>
                <label for="auth-email">Email</label>
                <input id="auth-email" type="email" autocomplete="email" maxlength="255" placeholder="you@example.com" required>
              </div>
              <div>
                <div class="auth-label-row">
                  <label for="auth-password">Password</label>
                  <button type="button" id="auth-password-toggle" class="auth-inline-btn" aria-controls="auth-password" aria-pressed="false">Show</button>
                </div>
                <input id="auth-password" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters" required>
              </div>
              <div id="auth-confirm-row" style="display:none;">
                <div class="auth-label-row">
                  <label for="auth-confirm-password">Confirm password</label>
                  <button type="button" id="auth-confirm-toggle" class="auth-inline-btn" aria-controls="auth-confirm-password" aria-pressed="false">Show</button>
                </div>
                <input id="auth-confirm-password" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter your password">
              </div>
            </div>
            <div id="auth-otp-section" class="auth-otp-section is-hidden">
              <div class="auth-label-row">
                <label for="auth-otp">Verification code</label>
                <button type="button" id="auth-otp-resend" class="auth-inline-btn">Resend code</button>
              </div>
              <input id="auth-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="Enter the code from your email">
              <div class="toolbar auth-otp-actions" style="margin-bottom:0;">
                <button type="button" id="auth-otp-back" class="auth-inline-btn">Edit details</button>
              </div>
            </div>
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

      const { form, loginTab, registerTab, password, confirm, passwordToggle, confirmToggle, name, email, otp, otpBack, otpResend } = authElements();
      form.addEventListener("submit", handleAuthSubmit);
      loginTab.addEventListener("click", () => switchAuthMode("login"));
      registerTab.addEventListener("click", () => switchAuthMode("register"));
      [name, email, password, confirm].forEach((input) => {
        if (!input) return;
        input.addEventListener("input", () => {
          setInputError(input, false);
          if (!authSubmitting) {
            setAuthStatus("");
          }
        });
      });
      password.addEventListener("input", updatePasswordUi);
      confirm.addEventListener("input", updatePasswordUi);
      [password, confirm].forEach((input) => {
        input.addEventListener("keydown", updateCapsLockState);
        input.addEventListener("keyup", updateCapsLockState);
        input.addEventListener("blur", () => updateCapsLockState(null, true));
      });
      passwordToggle.addEventListener("click", () => {
        setPasswordVisibility(password, passwordToggle, password.type === "password");
      });
      confirmToggle.addEventListener("click", () => {
        setPasswordVisibility(confirm, confirmToggle, confirm.type === "password");
      });
      if (otp) {
        otp.addEventListener("input", () => {
          setInputError(otp, false);
        });
      }
      if (otpBack) {
        otpBack.addEventListener("click", () => {
          setAuthStep("credentials");
          const activeUi = authElements();
          activeUi.password.focus();
        });
      }
      if (otpResend) {
        otpResend.addEventListener("click", handleResendOtp);
      }
    }
  }

  function switchAuthMode(nextMode) {
    authMode = nextMode === "register" ? "register" : "login";
    authStep = "credentials";
    pendingOtpEmail = "";
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
    setAuthStatus("");
    setPasswordVisibility(ui.password, ui.passwordToggle, false);
    setPasswordVisibility(ui.confirm, ui.confirmToggle, false);
    ui.password.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
    ui.confirm.setAttribute("autocomplete", isRegister ? "new-password" : "off");
    if (!isRegister) {
      ui.confirm.value = "";
    }
    if (ui.otp) {
      ui.otp.value = "";
    }
    updateCapsLockState(null, true);
    updatePasswordUi();
    if (isRegister) {
      showToast("Registration will send a verification code to your email.", "info", 4200);
    }
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
    resetOtpFlow();
    if (ui.otp) {
      ui.otp.value = "";
    }
    updateCapsLockState(null, true);
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
    const isRegister = authMode === "register";
    const isVerifyStep = isRegister && authStep === "verify";

    if (isVerifyStep) {
      if (!validateOtpForm()) return;
    } else if (!validateCredentialsForm()) {
      return;
    }

    authSubmitting = true;
    ui.submit.disabled = true;
    if (ui.otpResend) {
      ui.otpResend.disabled = true;
    }
    setAuthStatus(isVerifyStep
      ? "Verifying code..."
      : (isRegister ? "Creating account and sending a verification code..." : "Signing in..."));

    try {
      if (isRegister && !isVerifyStep) {
        const result = await window.ProgressAPI.startRegistration({
          name: ui.name.value.trim(),
          email: ui.email.value.trim(),
          password: ui.password.value
        });
        if (result && result.user) {
          closeAuthModal();
          window.location.reload();
          return;
        }

        pendingOtpEmail = (result && result.email) || ui.email.value.trim();
        if (ui.otp) {
          ui.otp.value = "";
        }
        setAuthStep("verify");
        setAuthStatus((result && result.message) || "Check your email for the verification code.", "status-good");
        if (ui.otp) {
          ui.otp.focus();
        }
        return;
      }

      if (isRegister && isVerifyStep) {
        await window.ProgressAPI.verifySignupOtp({
          email: pendingOtpEmail || ui.email.value.trim(),
          token: ui.otp.value.trim()
        });
        closeAuthModal();
        window.location.reload();
        return;
      }

      if (!isRegister) {
        await window.ProgressAPI.login({
          email: ui.email.value.trim(),
          password: ui.password.value
        });
        closeAuthModal();
        window.location.reload();
      }
    } catch (error) {
      setAuthStatus(error.message, "status-bad");
    } finally {
      authSubmitting = false;
      ui.submit.disabled = false;
      if (ui.otpResend) {
        ui.otpResend.disabled = false;
      }
    }
  }

  async function handleResendOtp() {
    const ui = authElements();
    if (!window.ProgressAPI || authSubmitting || authMode !== "register" || authStep !== "verify") {
      return;
    }

    const email = pendingOtpEmail || ui.email.value.trim();
    if (!email) {
      setAuthStatus("Enter your email first.", "status-bad");
      return;
    }

    authSubmitting = true;
    if (ui.otpResend) {
      ui.otpResend.disabled = true;
    }
    setAuthStatus("Resending verification code...");

    try {
      await window.ProgressAPI.resendSignupOtp({ email });
      setAuthStatus("Verification code resent. Check your inbox.", "status-good");
    } catch (error) {
      setAuthStatus(error.message, "status-bad");
    } finally {
      authSubmitting = false;
      if (ui.otpResend) {
        ui.otpResend.disabled = false;
      }
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
