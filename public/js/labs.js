(function () {
  if (document.body.dataset.page !== "labs") return;

  const LOCAL_STEP_PREFIX = "routeforge.labsteps.";

  const state = {
    labs: [],
    filteredLabs: [],
    completedLabs: new Set(),
    search: "",
    difficulty: "all",
    category: "all",
    status: "all",
    sort: "recommended",
    page: 1,
    pageSize: 60,
    selectedTags: new Set()
  };

  let renderToken = 0;

  const el = {
    search: document.getElementById("lab-search"),
    difficulty: document.getElementById("lab-difficulty-filter"),
    category: document.getElementById("lab-category-filter"),
    status: document.getElementById("lab-status-filter"),
    sort: document.getElementById("lab-sort"),
    resetSteps: document.getElementById("lab-reset-steps"),
    tagFilters: document.getElementById("lab-tag-filters"),
    clearTags: document.getElementById("lab-clear-tags"),
    pageSize: document.getElementById("lab-page-size"),
    pagePrev: document.getElementById("lab-page-prev"),
    pageNext: document.getElementById("lab-page-next"),
    pageInfo: document.getElementById("lab-page-info"),
    totalCount: document.getElementById("lab-total-count"),
    completedCount: document.getElementById("lab-completed-count"),
    inprogressCount: document.getElementById("lab-inprogress-count"),
    completionRate: document.getElementById("lab-completion-rate"),
    feedback: document.getElementById("lab-feedback"),
    list: document.getElementById("lab-list")
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeTag(tag) {
    return String(tag || "").trim();
  }

  function tagKey(tag) {
    return normalizeTag(tag).toLowerCase();
  }

  function localStepKey(labId) {
    return `${LOCAL_STEP_PREFIX}${labId}`;
  }

  function getLabStepProgress(lab) {
    const key = localStepKey(lab.id);

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return new Array(lab.steps.length).fill(false);
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return new Array(lab.steps.length).fill(false);
      }

      return lab.steps.map((_, index) => Boolean(parsed[index]));
    } catch (_error) {
      return new Array(lab.steps.length).fill(false);
    }
  }

  function saveLabStepProgress(labId, progress) {
    localStorage.setItem(localStepKey(labId), JSON.stringify(progress));
  }

  function clearAllLocalStepProgress() {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(LOCAL_STEP_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  function labProgressPercent(lab) {
    if (!lab.steps.length) return 0;
    const checked = getLabStepProgress(lab).filter(Boolean).length;
    return Math.round((checked / lab.steps.length) * 100);
  }

  function difficultyRank(difficulty) {
    const normalized = normalize(difficulty);
    if (normalized.includes("beginner")) return 1;
    if (normalized.includes("intermediate")) return 2;
    if (normalized.includes("advanced")) return 3;
    if (normalized.includes("expert")) return 4;
    return 5;
  }

  function showFeedback(message, isError = false) {
    if (!el.feedback) return;
    el.feedback.innerHTML = `<p class="${isError ? "status-bad" : "status-good"}">${escapeHtml(message)}</p>`;
  }

  function clearFeedback() {
    if (!el.feedback) return;
    el.feedback.innerHTML = "";
  }

  function populateDifficultyOptions() {
    if (!el.difficulty) return;

    const levels = [...new Set(state.labs.map((lab) => lab.difficulty))]
      .sort((a, b) => a.localeCompare(b));

    const options = ["<option value=\"all\">All difficulty levels</option>"]
      .concat(levels.map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`));

    el.difficulty.innerHTML = options.join("");
  }

  function populateCategoryOptions() {
    if (!el.category) return;

    const categories = [...new Set(state.labs.map((lab) => lab.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    const options = ["<option value=\"all\">All categories</option>"]
      .concat(categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`));

    el.category.innerHTML = options.join("");
  }

  function tagFrequency() {
    const counts = new Map();
    state.labs.forEach((lab) => {
      (lab.tags || []).forEach((tag) => {
        const key = tagKey(tag);
        if (!key) return;
        if (!counts.has(key)) {
          counts.set(key, { label: normalizeTag(tag), count: 0 });
        }
        const entry = counts.get(key);
        entry.count += 1;
      });
    });
    return counts;
  }

  function renderTagFilters() {
    if (!el.tagFilters) return;

    const counts = tagFrequency();
    const sortedTags = Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
      .map(([key, entry]) => ({ key, label: entry.label }));

    el.tagFilters.innerHTML = sortedTags
      .map((tag) => {
        const isActive = state.selectedTags.has(tag.key);
        return `<button class="chip tag-filter ${isActive ? "is-active" : ""}" data-tag="${escapeHtml(tag.key)}">${escapeHtml(tag.label)}</button>`;
      })
      .join("");
  }

  function clearSelectedTags() {
    state.selectedTags.clear();
    renderTagFilters();
  }

  function applyUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");
    const category = params.get("category");
    const tagsParam = params.getAll("tag").concat(params.get("tags") ? params.get("tags").split(",") : []);
    const tags = tagsParam.map((tag) => tagKey(tag)).filter(Boolean);

    if (query && el.search) {
      el.search.value = query;
      state.search = query;
    }

    if (category && el.category) {
      el.category.value = category;
      state.category = category;
    }

    if (tags.length) {
      tags.forEach((tag) => state.selectedTags.add(tag));
      renderTagFilters();
    }
  }

  function filterLabs() {
    const query = normalize(state.search);

    let result = [...state.labs];

    if (state.difficulty !== "all") {
      result = result.filter((lab) => lab.difficulty === state.difficulty);
    }

    if (state.category !== "all") {
      result = result.filter((lab) => lab.category === state.category);
    }

    if (state.status === "completed") {
      result = result.filter((lab) => state.completedLabs.has(lab.id));
    }

    if (state.status === "incomplete") {
      result = result.filter((lab) => !state.completedLabs.has(lab.id));
    }

    if (state.selectedTags.size) {
      result = result.filter((lab) => {
        const labTags = new Set((lab.tags || []).map((tag) => tagKey(tag)));
        for (const tag of state.selectedTags) {
          if (!labTags.has(tag)) return false;
        }
        return true;
      });
    }

    if (query) {
      result = result.filter((lab) => {
        const searchable = [
          lab.title,
          lab.scenario,
          lab.topology,
          lab.difficulty,
          lab.category,
          (lab.tags || []).join(" ")
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
    }

    if (state.sort === "title") {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (state.sort === "difficulty") {
      result.sort((a, b) => {
        const rankDiff = difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
        if (rankDiff !== 0) return rankDiff;
        return a.title.localeCompare(b.title);
      });
    } else {
      result.sort((a, b) => {
        const aCompleted = state.completedLabs.has(a.id) ? 1 : 0;
        const bCompleted = state.completedLabs.has(b.id) ? 1 : 0;
        if (aCompleted !== bCompleted) return aCompleted - bCompleted;

        const aProgress = labProgressPercent(a);
        const bProgress = labProgressPercent(b);
        if (aProgress !== bProgress) return bProgress - aProgress;

        return difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
      });
    }

    state.filteredLabs = result;
  }

  function renderStats() {
    const total = state.labs.length;
    const completed = state.completedLabs.size;
    const inProgress = state.labs.filter((lab) => {
      const percent = labProgressPercent(lab);
      return percent > 0 && percent < 100 && !state.completedLabs.has(lab.id);
    }).length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    if (el.totalCount) el.totalCount.textContent = String(total);
    if (el.completedCount) el.completedCount.textContent = String(completed);
    if (el.inprogressCount) el.inprogressCount.textContent = String(inProgress);
    if (el.completionRate) el.completionRate.textContent = `${completionRate}%`;
  }

  function renderLabCard(lab) {
    const progress = getLabStepProgress(lab);
    const checkedSteps = progress.filter(Boolean).length;
    const progressPercent = lab.steps.length ? Math.round((checkedSteps / lab.steps.length) * 100) : 0;
    const completed = state.completedLabs.has(lab.id);

    const commandsBlock = Array.isArray(lab.requiredCommands) ? lab.requiredCommands.join("\n") : "";
    const tagsRow = (lab.tags || []).length
      ? `<div class="chip-row">${lab.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div>`
      : "";

    return `
      <article class="card lab-card" data-lab-id="${escapeHtml(lab.id)}">
        <div class="lab-card-top">
          <h3>${escapeHtml(lab.title)}</h3>
          <div class="chip-row">
            <span class="chip">${escapeHtml(lab.difficulty)}</span>
            ${lab.category ? `<span class="chip">${escapeHtml(lab.category)}</span>` : ""}
            ${completed ? "<span class='chip'>Completed</span>" : ""}
          </div>
        </div>
        <p><strong>Scenario:</strong> ${escapeHtml(lab.scenario)}</p>
        <p><strong>Topology:</strong> ${escapeHtml(lab.topology)}</p>
        ${tagsRow}

        <div class="lab-progress-row">
          <span class="muted">Step progress: ${checkedSteps}/${lab.steps.length} (${progressPercent}%)</span>
        </div>
        <div class="lab-progress-track" aria-hidden="true">
          <span style="width:${progressPercent}%;"></span>
        </div>

        <details>
          <summary>Required CLI and walkthrough</summary>
          <p><strong>Required CLI:</strong></p>
          <pre>${escapeHtml(commandsBlock)}</pre>
          <div class="toolbar" style="margin:8px 0 10px;">
            <button data-action="copy-commands" data-lab-id="${escapeHtml(lab.id)}">Copy Commands</button>
            <button data-action="run-cli" data-lab-id="${escapeHtml(lab.id)}">Run in CLI</button>
            <button data-action="auto-validate" data-lab-id="${escapeHtml(lab.id)}">Auto Validate</button>
          </div>

          <p><strong>Step checklist:</strong></p>
          <ul class="list lab-step-list">
            ${lab.steps.map((step, index) => `
              <li>
                <label class="lab-step-item">
                  <input type="checkbox" data-action="toggle-step" data-lab-id="${escapeHtml(lab.id)}" data-step-index="${index}" ${progress[index] ? "checked" : ""}>
                  <span>${escapeHtml(step)}</span>
                </label>
              </li>
            `).join("")}
          </ul>

          <p><strong>Verification:</strong> ${escapeHtml(lab.verification)}</p>
        </details>

        <div class="toolbar" style="margin-top:10px;">
          <button data-action="complete-lab" data-lab-id="${escapeHtml(lab.id)}" class="btn btn-primary" ${completed ? "disabled" : ""}>
            ${completed ? "Completed" : "Mark Lab Complete"}
          </button>
        </div>
      </article>
    `;
  }

  function renderLabs() {
    filterLabs();
    renderStats();

    if (!state.filteredLabs.length) {
      el.list.innerHTML = "<article class='card'><p class='muted'>No labs match your current filters.</p></article>";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(state.filteredLabs.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);

    if (el.pageInfo) {
      el.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
    }
    if (el.pagePrev) el.pagePrev.disabled = state.page <= 1;
    if (el.pageNext) el.pageNext.disabled = state.page >= totalPages;

    const start = (state.page - 1) * state.pageSize;
    const pageItems = state.filteredLabs.slice(start, start + state.pageSize);

    const token = ++renderToken;
    el.list.innerHTML = "";
    let index = 0;
    const chunkSize = 12;

    function appendChunk() {
      if (token !== renderToken) return;
      const chunk = pageItems.slice(index, index + chunkSize);
      if (!chunk.length) return;
      const fragment = document.createDocumentFragment();
      chunk.forEach((lab) => {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = renderLabCard(lab);
        fragment.appendChild(wrapper.firstElementChild);
      });
      el.list.appendChild(fragment);
      index += chunkSize;
      if (index < pageItems.length) {
        requestAnimationFrame(appendChunk);
      }
    }

    requestAnimationFrame(appendChunk);
  }

  function findLabById(labId) {
    return state.labs.find((lab) => lab.id === labId) || null;
  }

  async function markLabComplete(labId) {
    if (state.completedLabs.has(labId)) return;

    if (!window.ProgressAPI) {
      showFeedback("Progress API is unavailable, unable to persist completion.", true);
      return;
    }

    try {
      await window.ProgressAPI.saveLabCompletion({ labId });
      state.completedLabs.add(labId);
      showFeedback("Lab marked complete.");
      renderLabs();
    } catch (error) {
      showFeedback(error.message || "Failed to mark lab complete.", true);
    }
  }

  async function copyCommands(labId) {
    const lab = findLabById(labId);
    if (!lab) return;

    const text = (lab.requiredCommands || []).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      showFeedback("Required CLI commands copied to clipboard.");
    } catch (_error) {
      showFeedback("Clipboard access failed. Copy commands manually from the card.", true);
    }
  }

  function normalizeCommandText(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function commandMatches(required, actual) {
    const req = normalizeCommandText(required);
    const act = normalizeCommandText(actual);
    if (!req || !act) return false;
    if (req.includes("...")) {
      const base = req.split("...")[0].trim();
      return act.startsWith(base);
    }
    return act === req || act.startsWith(req);
  }

  function autoValidateLab(labId) {
    const lab = findLabById(labId);
    if (!lab) return;

    if (!window.RouteForgeCLI || typeof window.RouteForgeCLI.getHistory !== "function") {
      showFeedback("Embedded CLI history unavailable. Run commands in the CLI first.", true);
      return;
    }

    const history = window.RouteForgeCLI.getHistory();
    const required = lab.requiredCommands || [];
    const missing = required.filter((cmd) => {
      return !history.some((entry) => commandMatches(cmd, entry));
    });

    if (missing.length) {
      const preview = missing.slice(0, 4).join(", ");
      const suffix = missing.length > 4 ? "..." : "";
      showFeedback(`Missing ${missing.length} required commands: ${preview}${suffix}`, true);
      return;
    }

    const progress = new Array(lab.steps.length).fill(true);
    saveLabStepProgress(labId, progress);
    showFeedback("Auto-validation passed. Steps marked complete.");
    renderLabs();
  }

  function runCommandsInCli(labId) {
    const lab = findLabById(labId);
    if (!lab) return;

    if (window.RouteForgeCLI && typeof window.RouteForgeCLI.runCommands === "function") {
      window.RouteForgeCLI.runCommands(lab.requiredCommands || [], { focus: true });
      showFeedback("Commands sent to embedded CLI.");
      return;
    }

    showFeedback("Embedded CLI is unavailable. Use the CLI page or copy commands.", true);
  }

  function toggleStep(labId, stepIndex, checked) {
    const lab = findLabById(labId);
    if (!lab) return;

    const progress = getLabStepProgress(lab);
    progress[stepIndex] = checked;
    saveLabStepProgress(labId, progress);

    clearFeedback();

    if (progress.every(Boolean) && !state.completedLabs.has(labId)) {
      showFeedback("All steps checked. Use 'Mark Lab Complete' to persist completion.");
    }

    renderLabs();
  }

  function bindEvents() {
    el.search.addEventListener("input", () => {
      state.search = el.search.value;
      state.page = 1;
      renderLabs();
    });

    el.difficulty.addEventListener("change", () => {
      state.difficulty = el.difficulty.value;
      state.page = 1;
      renderLabs();
    });

    if (el.category) {
      el.category.addEventListener("change", () => {
        state.category = el.category.value;
        state.page = 1;
        renderLabs();
      });
    }

    el.status.addEventListener("change", () => {
      state.status = el.status.value;
      state.page = 1;
      renderLabs();
    });

    el.sort.addEventListener("change", () => {
      state.sort = el.sort.value;
      state.page = 1;
      renderLabs();
    });

    el.resetSteps.addEventListener("click", () => {
      clearAllLocalStepProgress();
      showFeedback("Local step progress has been reset.");
      renderLabs();
    });

    if (el.tagFilters) {
      el.tagFilters.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-tag]");
        if (!button) return;
        const tag = tagKey(button.dataset.tag);
        if (!tag) return;
        if (state.selectedTags.has(tag)) {
          state.selectedTags.delete(tag);
        } else {
          state.selectedTags.add(tag);
        }
        state.page = 1;
        renderTagFilters();
        renderLabs();
      });
    }

    if (el.clearTags) {
      el.clearTags.addEventListener("click", () => {
        clearSelectedTags();
        state.page = 1;
        renderLabs();
      });
    }

    if (el.pageSize) {
      el.pageSize.addEventListener("change", () => {
        const nextSize = Number(el.pageSize.value);
        state.pageSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 60;
        state.page = 1;
        renderLabs();
      });
    }

    if (el.pagePrev) {
      el.pagePrev.addEventListener("click", () => {
        state.page = Math.max(1, state.page - 1);
        renderLabs();
      });
    }

    if (el.pageNext) {
      el.pageNext.addEventListener("click", () => {
        state.page += 1;
        renderLabs();
      });
    }

    el.list.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const action = button.dataset.action;
      const labId = button.dataset.labId;
      if (!labId) return;

      if (action === "complete-lab") {
        await markLabComplete(labId);
        return;
      }

      if (action === "copy-commands") {
        await copyCommands(labId);
        return;
      }

      if (action === "run-cli") {
        runCommandsInCli(labId);
        return;
      }

      if (action === "auto-validate") {
        autoValidateLab(labId);
      }
    });

    el.list.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-action='toggle-step']");
      if (!checkbox) return;

      const labId = checkbox.dataset.labId;
      const stepIndex = Number(checkbox.dataset.stepIndex);
      if (!labId || Number.isNaN(stepIndex)) return;

      toggleStep(labId, stepIndex, checkbox.checked);
    });
  }

  async function loadLabs() {
    el.list.innerHTML = "<article class='card'>Loading labs...</article>";

    try {
      const [labsRes, progress] = await Promise.all([
        fetch("/api/labs"),
        window.ProgressAPI ? window.ProgressAPI.getProgress() : Promise.resolve({ completedLabs: [] })
      ]);

      if (!labsRes.ok) {
        throw new Error(`Failed to load labs: ${labsRes.status}`);
      }

      state.labs = await labsRes.json();
      state.completedLabs = new Set((progress && progress.completedLabs) || []);

      if (el.pageSize) {
        const initialSize = Number(el.pageSize.value);
        state.pageSize = Number.isFinite(initialSize) && initialSize > 0 ? initialSize : 60;
      }

      populateDifficultyOptions();
      populateCategoryOptions();
      renderTagFilters();
      applyUrlFilters();
      bindEvents();
      renderLabs();
    } catch (error) {
      el.list.innerHTML = `<article class='card'><p class='status-bad'>${escapeHtml(error.message)}</p></article>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadLabs();
  });
})();
