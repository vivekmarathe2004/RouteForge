(function () {
  const state = {
    session: null,
    profile: null,
    progress: null,
    loading: true
  };

  function getNotify() {
    return window.RouteForgeNotify || {};
  }

  function showToast(message, tone = "info", timeout = 3600) {
    if (getNotify().showToast) {
      return getNotify().showToast(message, tone, timeout);
    }
    return null;
  }

  function queueFlashToast(message, tone = "info", timeout = 3600) {
    if (getNotify().queueFlashToast) {
      getNotify().queueFlashToast(message, tone, timeout);
      return;
    }
    try {
      sessionStorage.setItem(
        "routeforge:flash-toast",
        JSON.stringify({ message, tone, timeout })
      );
    } catch (_error) {
      showToast(message, tone, timeout);
    }
  }

  function elements() {
    return {
      loading: document.getElementById("profile-loading"),
      guest: document.getElementById("profile-guest"),
      content: document.getElementById("profile-content"),
      signin: document.getElementById("profile-signin"),
      register: document.getElementById("profile-register"),
      form: document.getElementById("profile-form"),
      save: document.getElementById("profile-save-button"),
      reset: document.getElementById("profile-reset-button"),
      deleteConfirm: document.getElementById("profile-delete-confirm"),
      deleteButton: document.getElementById("profile-delete-button"),
      displayName: document.getElementById("profile-display-name-input"),
      fullName: document.getElementById("profile-full-name-input"),
      phone: document.getElementById("profile-phone-input"),
      location: document.getElementById("profile-location-input"),
      bio: document.getElementById("profile-bio-input"),
      email: document.getElementById("profile-email"),
      displayNameLabel: document.getElementById("profile-display-name"),
      createdAt: document.getElementById("profile-created-at"),
      updatedAt: document.getElementById("profile-updated-at"),
      quizzes: document.getElementById("profile-quizzes"),
      subnet: document.getElementById("profile-subnet"),
      labs: document.getElementById("profile-labs"),
      best: document.getElementById("profile-best")
    };
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
  }

  function setVisible(node, visible) {
    if (!node) return;
    node.classList.toggle("is-hidden", !visible);
  }

  function profileSnapshot() {
    const ui = elements();
    const profile = state.profile || {};
    const session = state.session && state.session.user ? state.session.user : null;

    if (ui.email) {
      ui.email.textContent = profile.email || (session ? session.email : "-");
    }
    if (ui.displayNameLabel) {
      ui.displayNameLabel.textContent = profile.displayName || (session ? session.name : "-");
    }
    if (ui.createdAt) {
      ui.createdAt.textContent = formatDate(profile.createdAt || (session ? session.createdAt : null));
    }
    if (ui.updatedAt) {
      ui.updatedAt.textContent = formatDate(profile.updatedAt);
    }
    if (ui.quizzes) {
      ui.quizzes.textContent = String((state.progress && state.progress.quizzesTaken) || 0);
    }
    if (ui.subnet) {
      ui.subnet.textContent = String((state.progress && state.progress.subnetAttempts) || 0);
    }
    if (ui.labs) {
      ui.labs.textContent = String((state.progress && state.progress.labsDone) || 0);
    }
    if (ui.best) {
      ui.best.textContent = `${(state.progress && state.progress.bestQuizScore) || 0}%`;
    }
  }

  function populateForm() {
    const ui = elements();
    const profile = state.profile || {};
    const session = state.session && state.session.user ? state.session.user : null;

    if (ui.displayName) {
      ui.displayName.value = profile.displayName || (session ? session.name : "");
    }
    if (ui.fullName) {
      ui.fullName.value = profile.fullName || "";
    }
    if (ui.phone) {
      ui.phone.value = profile.phone || "";
    }
    if (ui.location) {
      ui.location.value = profile.location || "";
    }
    if (ui.bio) {
      ui.bio.value = profile.bio || "";
    }
    if (ui.deleteConfirm) {
      ui.deleteConfirm.value = "";
    }
  }

  function renderProfileState() {
    const ui = elements();
    const signedIn = Boolean(state.session && state.session.user);

    setVisible(ui.loading, false);
    setVisible(ui.guest, !signedIn);
    setVisible(ui.content, signedIn);

    if (signedIn) {
      profileSnapshot();
      populateForm();
    }
  }

  function wireAuthButtons() {
    const ui = elements();
    if (ui.signin && ui.signin.dataset.bound !== "true") {
      ui.signin.dataset.bound = "true";
      ui.signin.addEventListener("click", () => {
        if (window.RouteForgeAuth) {
          window.RouteForgeAuth.open("login");
        }
      });
    }

    if (ui.register && ui.register.dataset.bound !== "true") {
      ui.register.dataset.bound = "true";
      ui.register.addEventListener("click", () => {
        if (window.RouteForgeAuth) {
          window.RouteForgeAuth.open("register");
        }
      });
    }
  }

  function validateProfileForm() {
    const ui = elements();
    const displayName = ui.displayName.value.trim();

    if (displayName.length < 2) {
      showToast("Display name must be at least 2 characters.", "error", 3200);
      ui.displayName.focus();
      return null;
    }

    return {
      displayName,
      fullName: ui.fullName.value.trim(),
      phone: ui.phone.value.trim(),
      location: ui.location.value.trim(),
      bio: ui.bio.value.trim()
    };
  }

  async function loadProfile() {
    const ui = elements();
    setVisible(ui.loading, true);
    setVisible(ui.guest, false);
    setVisible(ui.content, false);

    if (!window.ProgressAPI) {
      setVisible(ui.loading, false);
      setVisible(ui.guest, true);
      return;
    }

    try {
      state.session = await window.ProgressAPI.fetchSession();
    } catch (_error) {
      state.session = null;
    }

    if (!state.session || !state.session.user) {
      state.profile = null;
      state.progress = null;
      renderProfileState();
      return;
    }

    try {
      const data = await window.ProgressAPI.fetchProfile();
      state.profile = data.profile || null;
      state.progress = data.progress || null;
      if (data.user && window.ProgressAPI.fetchSession) {
        await window.ProgressAPI.fetchSession(true).catch(() => null);
      }
    } catch (error) {
      state.profile = null;
      state.progress = null;
      showToast(error.message, "error", 3600);
    }

    renderProfileState();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!window.ProgressAPI || !state.session || !state.session.user) {
      return;
    }

    const ui = elements();
    const payload = validateProfileForm();
    if (!payload) return;

    ui.save.disabled = true;
    ui.reset.disabled = true;

    try {
      const result = await window.ProgressAPI.updateProfile(payload);
      state.profile = result.profile || state.profile;
      state.session = result.user ? { user: { ...state.session.user, name: result.user.name, email: result.user.email } } : state.session;
      if (window.ProgressAPI.fetchSession) {
        await window.ProgressAPI.fetchSession(true).catch(() => null);
      }
      renderProfileState();
      showToast("Profile updated successfully.", "success", 3200);
    } catch (error) {
      showToast(error.message, "error", 3800);
    } finally {
      ui.save.disabled = false;
      ui.reset.disabled = false;
    }
  }

  function resetForm() {
    populateForm();
    showToast("Profile changes reset.", "info", 2200);
  }

  async function handleDelete() {
    const ui = elements();
    if (!window.ProgressAPI || !state.session || !state.session.user) {
      return;
    }

    const confirmValue = ui.deleteConfirm.value.trim().toUpperCase();
    if (confirmValue !== "DELETE") {
      showToast('Type "DELETE" to confirm account removal.', "warning", 3600);
      ui.deleteConfirm.focus();
      return;
    }

    if (!window.confirm("Delete your RouteForge account permanently? This cannot be undone.")) {
      return;
    }

    ui.deleteButton.disabled = true;
    ui.save.disabled = true;
    ui.reset.disabled = true;

    try {
      await window.ProgressAPI.deleteAccount({ confirm: "DELETE" });
      queueFlashToast("Account deleted successfully.", "success", 4200);
      window.location.href = "index.html";
    } catch (error) {
      showToast(error.message, "error", 3800);
      ui.deleteButton.disabled = false;
      ui.save.disabled = false;
      ui.reset.disabled = false;
    }
  }

  function bindEvents() {
    const ui = elements();

    if (ui.form && ui.form.dataset.bound !== "true") {
      ui.form.dataset.bound = "true";
      ui.form.addEventListener("submit", handleSubmit);
    }

    if (ui.reset && ui.reset.dataset.bound !== "true") {
      ui.reset.dataset.bound = "true";
      ui.reset.addEventListener("click", resetForm);
    }

    if (ui.deleteButton && ui.deleteButton.dataset.bound !== "true") {
      ui.deleteButton.dataset.bound = "true";
      ui.deleteButton.addEventListener("click", handleDelete);
    }

    if (window.ProgressAPI) {
      window.ProgressAPI.onAuthChange((nextSession) => {
        state.session = nextSession;
        if (!state.session || !state.session.user) {
          state.profile = null;
          state.progress = null;
        }
        renderProfileState();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    wireAuthButtons();
    bindEvents();
    await loadProfile();
  });
})();
