(function () {
  if (document.body.dataset.page !== "quizzes") return;

  const state = {
    questions: [],
    currentIndex: 0,
    score: 0,
    totalSeconds: 0,
    timerId: null,
    mode: "practice",
    answered: false,
    topicIndex: {
      ccna: [],
      ccnp: []
    }
  };

  const el = {
    level: document.getElementById("quiz-level"),
    count: document.getElementById("quiz-count"),
    mode: document.getElementById("quiz-mode"),
    start: document.getElementById("start-quiz"),
    next: document.getElementById("next-question"),
    timer: document.getElementById("quiz-timer"),
    score: document.getElementById("quiz-score"),
    status: document.getElementById("quiz-status"),
    question: document.getElementById("quiz-question"),
    options: document.getElementById("quiz-options"),
    explanation: document.getElementById("quiz-explanation"),
    result: document.getElementById("quiz-result"),
    bankSearch: document.getElementById("bank-search"),
    bankTopic: document.getElementById("bank-topic"),
    bankLevel: document.getElementById("bank-level"),
    bankPageSize: document.getElementById("bank-page-size"),
    bankPrev: document.getElementById("bank-prev"),
    bankNext: document.getElementById("bank-next"),
    bankPageInfo: document.getElementById("bank-page-info"),
    bankTotal: document.getElementById("bank-total"),
    bankResults: document.getElementById("bank-results")
  };

  const bankState = {
    page: 1,
    pageSize: 20,
    total: 0,
    debounceId: null
  };

  const topicTagMap = {
    vlan: "VLAN",
    ospf: "OSPF",
    acl: "ACL",
    nat: "NAT",
    dhcp: "DHCP",
    subnetting: "Subnetting",
    stp: "STP",
    routing: "Routing",
    wireless: "Wireless",
    dns: "DNS",
    bgp: "BGP",
    mpls: "MPLS",
    qos: "QoS",
    "high availability": "HSRP",
    automation: "Automation"
  };

  const availableLabTags = new Set([
    "VLAN",
    "Trunking",
    "Inter-VLAN",
    "Static Routing",
    "OSPF",
    "ACL",
    "NAT",
    "DHCP",
    "STP",
    "EtherChannel",
    "Port Security",
    "HSRP",
    "Routing",
    "Switching",
    "Security",
    "Services",
    "High Availability"
  ]);

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function maybeOpenAuth(error) {
    if (error && /sign in/i.test(String(error.message || "")) && window.RouteForgeAuth) {
      window.RouteForgeAuth.open("login");
    }
  }

  function resetBoard() {
    el.question.textContent = "Click Start Quiz to begin.";
    el.options.innerHTML = "";
    el.explanation.innerHTML = "";
    el.result.innerHTML = "";
    el.status.textContent = "";
    el.score.textContent = "0";
    el.timer.textContent = "00:00";
    el.next.disabled = true;
  }

  async function loadTopicIndex() {
    try {
      const [ccnaRes, ccnpRes] = await Promise.all([
        fetch("/api/topics?track=ccna"),
        fetch("/api/topics?track=ccnp")
      ]);
      if (ccnaRes.ok) {
        state.topicIndex.ccna = await ccnaRes.json();
      }
      if (ccnpRes.ok) {
        state.topicIndex.ccnp = await ccnpRes.json();
      }
    } catch (_error) {
      state.topicIndex.ccna = [];
      state.topicIndex.ccnp = [];
    }
  }

  function findTopicLink(question) {
    const topic = String(question.topic || "").toLowerCase();
    if (!topic) return null;
    const isCcnp = String(question.level || "").toLowerCase().includes("ccnp");
    const pool = isCcnp ? state.topicIndex.ccnp : state.topicIndex.ccna;
    if (!pool.length) return null;

    const match =
      pool.find((item) => item.title.toLowerCase().includes(topic)) ||
      pool.find((item) => item.summary.toLowerCase().includes(topic)) ||
      pool.find((item) => item.title.toLowerCase().includes(topic.split(" ")[0]));

    if (!match) return null;
    return {
      track: isCcnp ? "ccnp" : "ccna",
      id: match.id,
      title: match.title
    };
  }

  function findLabLink(question) {
    const topic = String(question.topic || "").toLowerCase();
    if (!topic) return null;

    const tagKey = Object.keys(topicTagMap).find((key) => topic.includes(key));
    if (tagKey) {
      const tag = topicTagMap[tagKey];
      if (availableLabTags.has(tag)) {
        return `labs.html?tag=${encodeURIComponent(tag)}`;
      }
    }

    return `labs.html?q=${encodeURIComponent(question.topic || "")}`;
  }

  function renderRelatedLinks(question) {
    const links = [];
    const topicLink = findTopicLink(question);
    if (topicLink) {
      links.push(`<a class="btn" href="learn.html?track=${topicLink.track}&topic=${encodeURIComponent(topicLink.id)}">Review: ${escapeHtml(topicLink.title)}</a>`);
    }

    const labLink = findLabLink(question);
    if (labLink) {
      links.push(`<a class="btn" href="${labLink}">Related labs</a>`);
    }

    if (!links.length) return "";
    return `<div class="toolbar" style="margin-top:8px;">${links.join("")}</div>`;
  }

  function setTimerText() {
    const min = Math.floor(state.totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const sec = (state.totalSeconds % 60).toString().padStart(2, "0");
    el.timer.textContent = `${min}:${sec}`;
  }

  function startTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      state.totalSeconds += 1;
      setTimerText();

      if (state.mode === "exam" && state.totalSeconds >= 20 * 60) {
        finishQuiz();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function renderQuestion() {
    const current = state.questions[state.currentIndex];
    if (!current) return;

    state.answered = false;
    el.status.textContent = `Question ${state.currentIndex + 1}/${state.questions.length} | ${current.level} | ${current.topic}`;
    el.question.textContent = current.question;
    el.explanation.innerHTML = "";
    el.options.innerHTML = current.options
      .map((option, index) => {
        return `<button class="quiz-option" data-index="${index}">${escapeHtml(option)}</button>`;
      })
      .join("");

    Array.from(el.options.querySelectorAll("button")).forEach((button) => {
      button.addEventListener("click", () => submitAnswer(Number(button.dataset.index)));
    });

    el.next.disabled = true;
  }

  function submitAnswer(selected) {
    if (state.answered) return;

    const current = state.questions[state.currentIndex];
    const correct = selected === current.answerIndex;
    state.answered = true;

    Array.from(el.options.querySelectorAll("button")).forEach((btn) => {
      const idx = Number(btn.dataset.index);
      btn.disabled = true;
      if (idx === current.answerIndex) {
        btn.classList.add("btn-primary");
      }
      if (idx === selected && !correct) {
        btn.classList.add("btn-danger");
      }
    });

    if (correct) state.score += 1;
    el.score.textContent = String(state.score);

    const statusClass = correct ? "status-good" : "status-bad";
    const statusText = correct ? "Correct." : "Incorrect.";
    const selectedText = current.options[selected] || "Your answer";
    const correctText = current.options[current.answerIndex] || "Correct answer";
    const whyNot = correct
      ? ""
      : `<p class="muted">Why not: ${escapeHtml(selectedText)} is not correct. Correct answer: ${escapeHtml(correctText)}.</p>`;
    const relatedLinks = renderRelatedLinks(current);
    const explanationText = current.explanation || "No explanation available.";
    el.explanation.innerHTML = `<p class="${statusClass}">${statusText}</p>${whyNot}<p class="muted">${escapeHtml(explanationText)}</p>${relatedLinks}`;

    el.next.disabled = false;
  }

  async function finishQuiz() {
    stopTimer();

    const total = state.questions.length;
    if (!total) return;

    const percent = Math.round((state.score / total) * 100);
    el.result.innerHTML = `<div class="card"><h3>Quiz Complete</h3><p>Score: <strong>${state.score}/${total}</strong> (${percent}%)</p><p class="muted">Time: ${el.timer.textContent}</p></div>`;

    try {
      if (window.ProgressAPI) {
        await window.ProgressAPI.saveQuizResult({
          level: el.level.value,
          score: state.score,
          total
        });
      }
    } catch (error) {
      maybeOpenAuth(error);
      el.result.innerHTML += `<p class="status-bad">${escapeHtml(error.message || "Unable to save progress.")}</p>`;
    }

    el.next.disabled = true;
    el.question.textContent = "Start a new quiz to continue practicing.";
    el.options.innerHTML = "";
    el.explanation.innerHTML = "";
  }

  async function loadQuiz() {
    resetBoard();
    state.currentIndex = 0;
    state.score = 0;
    state.totalSeconds = 0;
    state.mode = el.mode.value;
    setTimerText();

    const level = encodeURIComponent(el.level.value);
    const count = Number(el.count.value) || 10;

    const data = await fetch(`/api/quizzes?level=${level}&count=${count}`);
    const questions = await data.json();

    if (!Array.isArray(questions) || !questions.length) {
      el.question.textContent = "No questions available for this level.";
      return;
    }

    state.questions = questions;
    startTimer();
    renderQuestion();
  }

  function renderBankResults(items) {
    if (!el.bankResults) return;

    if (!items.length) {
      el.bankResults.innerHTML = "<article class='card'><p class='muted'>No questions match your filters.</p></article>";
      return;
    }

    el.bankResults.innerHTML = items
      .map((item) => {
        const options = (item.options || [])
          .map((opt, index) => {
            const isAnswer = index === item.answerIndex;
            return `<li>${escapeHtml(opt)}${isAnswer ? " <span class='chip'>Answer</span>" : ""}</li>`;
          })
          .join("");
        return `
          <article class="card">
            <div class="lab-card-top">
              <strong>${escapeHtml(item.question)}</strong>
              <span class="chip">${escapeHtml(item.level)}</span>
            </div>
            <p class="muted">Topic: ${escapeHtml(item.topic || "General")}</p>
            <details>
              <summary>Show options and explanation</summary>
              <ul class="list">${options}</ul>
              <p class="muted">${escapeHtml(item.explanation || "No explanation available.")}</p>
            </details>
          </article>
        `;
      })
      .join("");
  }

  async function loadQuestionBank() {
    if (!el.bankResults) return;

    el.bankResults.innerHTML = "<article class='card'>Loading questions...</article>";

    const params = new URLSearchParams();
    const level = el.bankLevel ? el.bankLevel.value : "all";
    const topic = el.bankTopic ? el.bankTopic.value.trim() : "";
    const query = el.bankSearch ? el.bankSearch.value.trim() : "";

    if (level && level !== "all") params.set("level", level);
    if (topic) params.set("topic", topic);
    if (query) params.set("q", query);
    params.set("page", String(bankState.page));
    params.set("pageSize", String(bankState.pageSize));

    try {
      const res = await fetch(`/api/quiz-bank?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load question bank: ${res.status}`);
      const data = await res.json();
      bankState.total = data.total || 0;
      renderBankResults(data.items || []);

      const totalPages = Math.max(1, Math.ceil(bankState.total / bankState.pageSize));
      if (el.bankPageInfo) {
        el.bankPageInfo.textContent = `Page ${bankState.page} of ${totalPages}`;
      }
      if (el.bankTotal) {
        el.bankTotal.textContent = `${bankState.total} questions`;
      }
      if (el.bankPrev) el.bankPrev.disabled = bankState.page <= 1;
      if (el.bankNext) el.bankNext.disabled = bankState.page >= totalPages;
    } catch (error) {
      el.bankResults.innerHTML = `<article class='card'><p class='status-bad'>${escapeHtml(error.message)}</p></article>`;
    }
  }

  function debounceBankLoad() {
    if (bankState.debounceId) clearTimeout(bankState.debounceId);
    bankState.debounceId = setTimeout(() => {
      bankState.page = 1;
      loadQuestionBank();
    }, 250);
  }

  function bindQuestionBank() {
    if (!el.bankResults) return;

    if (el.bankPageSize) {
      const initialSize = Number(el.bankPageSize.value);
      bankState.pageSize = Number.isFinite(initialSize) && initialSize > 0 ? initialSize : 20;
      el.bankPageSize.addEventListener("change", () => {
        const nextSize = Number(el.bankPageSize.value);
        bankState.pageSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 20;
        bankState.page = 1;
        loadQuestionBank();
      });
    }

    if (el.bankSearch) {
      el.bankSearch.addEventListener("input", debounceBankLoad);
    }
    if (el.bankTopic) {
      el.bankTopic.addEventListener("input", debounceBankLoad);
    }
    if (el.bankLevel) {
      el.bankLevel.addEventListener("change", () => {
        bankState.page = 1;
        loadQuestionBank();
      });
    }

    if (el.bankPrev) {
      el.bankPrev.addEventListener("click", () => {
        bankState.page = Math.max(1, bankState.page - 1);
        loadQuestionBank();
      });
    }

    if (el.bankNext) {
      el.bankNext.addEventListener("click", () => {
        bankState.page += 1;
        loadQuestionBank();
      });
    }

    loadQuestionBank();
  }

  function bindEvents() {
    el.start.addEventListener("click", async () => {
      try {
        await loadQuiz();
      } catch (error) {
        el.question.textContent = `Failed to load quiz: ${error.message}`;
      }
    });

    el.next.addEventListener("click", () => {
      state.currentIndex += 1;
      if (state.currentIndex >= state.questions.length) {
        finishQuiz();
        return;
      }
      renderQuestion();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    resetBoard();
    loadTopicIndex();
    bindEvents();
    bindQuestionBank();
  });
})();
