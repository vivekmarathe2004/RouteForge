(function () {
  const API_BASE = "/api";

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });

    if (!response.ok) {
      const fallback = `Request failed: ${response.status}`;
      try {
        const data = await response.json();
        throw new Error(data.error || fallback);
      } catch (_error) {
        throw new Error(fallback);
      }
    }

    return response.json();
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  }

  window.ProgressAPI = {
    request,
    formatDate,
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
    resetProgress() {
      return request("/progress/reset", { method: "POST" });
    }
  };
})();
