(function () {
  const API_BASE = "/api";
  const authListeners = new Set();
  let session = null;
  let sessionLoaded = false;

  async function request(path, options = {}) {
    const {
      allowUnauthorized = false,
      headers = {},
      body,
      ...rest
    } = options;

    const finalHeaders = { ...headers };
    const finalOptions = {
      credentials: "same-origin",
      ...rest,
      headers: finalHeaders
    };

    if (body !== undefined) {
      finalOptions.body = body;
      if (!finalHeaders["Content-Type"]) {
        finalHeaders["Content-Type"] = "application/json";
      }
    }

    const response = await fetch(`${API_BASE}${path}`, finalOptions);

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };

    if (response.status === 401 && allowUnauthorized) {
      return null;
    }

    if (!response.ok) {
      throw new Error(data && data.error ? data.error : `Request failed: ${response.status}`);
    }

    return data;
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  }

  function setSession(nextSession) {
    session = nextSession && nextSession.user ? nextSession : null;
    sessionLoaded = true;
    authListeners.forEach((listener) => listener(session));
    return session;
  }

  function getSession() {
    return session;
  }

  function isAuthenticated() {
    return Boolean(session && session.user);
  }

  async function fetchSession(force = false) {
    if (sessionLoaded && !force) {
      return session;
    }

    const data = await request("/auth/session", { allowUnauthorized: true });
    return setSession(data);
  }

  function onAuthChange(listener) {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  }

  async function register(payload) {
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return setSession(data);
  }

  async function login(payload) {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return setSession(data);
  }

  async function logout() {
    await request("/auth/logout", { method: "POST" });
    return setSession(null);
  }

  window.ProgressAPI = {
    request,
    formatDate,
    fetchSession,
    getSession,
    isAuthenticated,
    onAuthChange,
    register,
    login,
    logout,
    getProgress: () => request("/progress"),
    fetchDashboard: () => request("/dashboard"),
    saveQuizResult(payload) {
      return request("/progress/quiz", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    saveSubnetResult(payload) {
      return request("/progress/subnet", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    saveLabCompletion(payload) {
      return request("/progress/lab", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    saveLabStepProgress(payload) {
      return request("/progress/lab-steps", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    resetLabStepProgress() {
      return request("/progress/lab-steps/reset", { method: "POST" });
    },
    resetProgress() {
      return request("/progress/reset", { method: "POST" });
    }
  };
})();
