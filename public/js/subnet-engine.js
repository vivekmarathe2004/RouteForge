(function () {
  if (document.body.dataset.page !== "subnet") return;

  const difficultyCidrPool = {
    easy: [24, 25, 26, 27, 28, 29, 30],
    medium: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    hard: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
  };

  const questionTemplates = [
    {
      type: "network-address",
      label: "Network Address",
      answerKind: "ip",
      prompt: (ctx) => `Given ${ctx.ip} /${ctx.cidr} (${ctx.mask}), find the network address.`,
      answer: (ctx) => ctx.network
    },
    {
      type: "broadcast",
      label: "Broadcast Address",
      answerKind: "ip",
      prompt: (ctx) => `Given ${ctx.ip} /${ctx.cidr} (${ctx.mask}), find the broadcast address.`,
      answer: (ctx) => ctx.broadcast
    },
    {
      type: "first-host",
      label: "First Usable Host",
      answerKind: "ip",
      prompt: (ctx) => `Given ${ctx.ip} /${ctx.cidr} (${ctx.mask}), find the first usable host address.`,
      answer: (ctx) => ctx.firstHost
    },
    {
      type: "last-host",
      label: "Last Usable Host",
      answerKind: "ip",
      prompt: (ctx) => `Given ${ctx.ip} /${ctx.cidr} (${ctx.mask}), find the last usable host address.`,
      answer: (ctx) => ctx.lastHost
    },
    {
      type: "hosts",
      label: "Usable Hosts",
      answerKind: "number",
      prompt: (ctx) => `Given ${ctx.ip} /${ctx.cidr} (${ctx.mask}), how many usable hosts are available?`,
      answer: (ctx) => String(ctx.usableHosts)
    },
    {
      type: "block-size",
      label: "Block Size",
      answerKind: "number",
      prompt: (ctx) => `Given ${ctx.ip} /${ctx.cidr} (${ctx.mask}), what is the block size (total addresses per subnet)?`,
      answer: (ctx) => String(ctx.blockSize)
    },
    {
      type: "cidr",
      label: "CIDR Notation",
      answerKind: "cidr",
      prompt: (ctx) => `Given mask ${ctx.mask}, find CIDR notation.`,
      answer: (ctx) => `/${ctx.cidr}`
    },
    {
      type: "mask",
      label: "Subnet Mask",
      answerKind: "ip",
      prompt: (ctx) => `Given CIDR /${ctx.cidr}, find subnet mask notation.`,
      answer: (ctx) => ctx.mask
    }
  ];

  const state = {
    mode: "practice",
    difficulty: "easy",
    active: false,
    timerId: null,
    totalSeconds: 0,
    asked: 0,
    score: 0,
    limit: Infinity,
    examMaxSeconds: Infinity,
    current: null,
    questionAnswered: false,
    streak: 0,
    bestStreak: 0,
    previousSignature: ""
  };

  const el = {
    mode: document.getElementById("subnet-mode"),
    difficulty: document.getElementById("subnet-difficulty"),
    start: document.getElementById("start-subnet"),
    finish: document.getElementById("finish-subnet"),
    submit: document.getElementById("submit-subnet"),
    next: document.getElementById("next-subnet"),
    timer: document.getElementById("subnet-timer"),
    score: document.getElementById("subnet-score"),
    asked: document.getElementById("subnet-asked"),
    accuracy: document.getElementById("subnet-accuracy"),
    streak: document.getElementById("subnet-streak"),
    prompt: document.getElementById("subnet-prompt"),
    type: document.getElementById("subnet-question-type"),
    answer: document.getElementById("subnet-answer"),
    feedback: document.getElementById("subnet-feedback"),
    result: document.getElementById("subnet-result")
  };

  function maybeOpenAuth(error) {
    if (error && /sign in/i.test(String(error.message || "")) && window.RouteForgeAuth) {
      window.RouteForgeAuth.open("login");
    }
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function ipToInt(ip) {
    const parts = ip.split(".").map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => Number.isNaN(part) || !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      throw new Error("Invalid IPv4 value.");
    }

    return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
  }

  function intToIp(intValue) {
    return [
      (intValue >>> 24) & 255,
      (intValue >>> 16) & 255,
      (intValue >>> 8) & 255,
      intValue & 255
    ].join(".");
  }

  function cidrToMask(cidr) {
    if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) {
      throw new Error("Invalid CIDR value.");
    }

    if (cidr === 0) return "0.0.0.0";
    const maskInt = (~((1 << (32 - cidr)) - 1)) >>> 0;
    return intToIp(maskInt);
  }

  function parseIpv4(value) {
    const parts = String(value || "").trim().split(".");
    if (parts.length !== 4) return null;

    const octets = [];
    for (const part of parts) {
      if (!/^\d+$/.test(part)) return null;
      const parsed = Number(part);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) return null;
      octets.push(String(parsed));
    }

    return octets.join(".");
  }

  function normalizeInteger(value) {
    const cleaned = String(value || "")
      .trim()
      .replaceAll(",", "")
      .replaceAll("_", "");

    if (!/^-?\d+$/.test(cleaned)) return null;
    return String(Number.parseInt(cleaned, 10));
  }

  function normalizeCidr(value) {
    let cleaned = String(value || "").trim();
    if (cleaned.startsWith("/")) cleaned = cleaned.slice(1);
    if (!/^\d{1,2}$/.test(cleaned)) return null;

    const cidr = Number(cleaned);
    if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) return null;
    return `/${cidr}`;
  }

  function normalizeAnswer(kind, value) {
    if (kind === "ip") return parseIpv4(value);
    if (kind === "number") return normalizeInteger(value);
    if (kind === "cidr") return normalizeCidr(value);
    return String(value || "").trim().toLowerCase();
  }

  function feedback(kind, text) {
    if (!el.feedback) return;
    el.feedback.innerHTML = "";
    const node = document.createElement("p");
    node.className = kind;
    node.textContent = text;
    el.feedback.appendChild(node);
  }

  function answerPlaceholder(kind) {
    if (kind === "ip") return "Example: 192.168.1.0";
    if (kind === "cidr") return "Example: /27 or 27";
    if (kind === "number") return "Example: 62";
    return "Enter your answer";
  }

  function randomSourceIp() {
    let firstOctet = randomInt(10, 223);
    while (firstOctet === 127) {
      firstOctet = randomInt(10, 223);
    }

    return `${firstOctet}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
  }

  function buildQuestionContext(cidr) {
    const ip = randomSourceIp();
    const ipInt = ipToInt(ip);
    const mask = cidrToMask(cidr);
    const maskInt = ipToInt(mask);
    const networkInt = ipInt & maskInt;
    const broadcastInt = networkInt | (~maskInt >>> 0);
    const hostBits = 32 - cidr;
    const blockSize = 2 ** hostBits;
    const usableHosts = Math.max(blockSize - 2, 0);

    return {
      cidr,
      mask,
      ip,
      network: intToIp(networkInt),
      broadcast: intToIp(broadcastInt),
      firstHost: intToIp(hostBits <= 1 ? networkInt : networkInt + 1),
      lastHost: intToIp(hostBits <= 1 ? broadcastInt : broadcastInt - 1),
      blockSize,
      usableHosts
    };
  }

  function makeQuestion() {
    const cidrPool = difficultyCidrPool[state.difficulty] || difficultyCidrPool.easy;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const cidr = cidrPool[randomInt(0, cidrPool.length - 1)];
      const context = buildQuestionContext(cidr);
      const selectedTemplate = questionTemplates[randomInt(0, questionTemplates.length - 1)];
      const question = {
        type: selectedTemplate.type,
        label: selectedTemplate.label,
        answerKind: selectedTemplate.answerKind,
        prompt: selectedTemplate.prompt(context),
        answer: selectedTemplate.answer(context)
      };

      const signature = `${question.type}|${question.prompt}|${question.answer}`;
      if (signature !== state.previousSignature) {
        state.previousSignature = signature;
        return question;
      }
    }

    const fallbackCidr = cidrPool[0];
    const fallbackContext = buildQuestionContext(fallbackCidr);
    const fallbackTemplate = questionTemplates[0];
    return {
      type: fallbackTemplate.type,
      label: fallbackTemplate.label,
      answerKind: fallbackTemplate.answerKind,
      prompt: fallbackTemplate.prompt(fallbackContext),
      answer: fallbackTemplate.answer(fallbackContext)
    };
  }

  function updateStats() {
    el.score.textContent = String(state.score);
    el.asked.textContent = String(state.asked);

    if (el.accuracy) {
      const accuracy = state.asked ? Math.round((state.score / state.asked) * 100) : 0;
      el.accuracy.textContent = `${accuracy}%`;
    }

    if (el.streak) {
      el.streak.textContent = `${state.streak} (best ${state.bestStreak})`;
    }
  }

  function updateControlState() {
    const active = state.active;
    if (el.mode) el.mode.disabled = active;
    if (el.difficulty) el.difficulty.disabled = active;
    if (el.answer) el.answer.disabled = !active;
    if (el.submit) el.submit.disabled = !active || state.questionAnswered;
    if (el.next) el.next.disabled = !active;
    if (el.finish) el.finish.disabled = !active;
    if (el.start) {
      el.start.textContent = active ? "Restart Session" : "Start Session";
    }
  }

  function setTimerText() {
    const mm = String(Math.floor(state.totalSeconds / 60)).padStart(2, "0");
    const ss = String(state.totalSeconds % 60).padStart(2, "0");
    el.timer.textContent = `${mm}:${ss}`;
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(() => {
      state.totalSeconds += 1;
      setTimerText();

      if (state.mode === "exam" && state.totalSeconds >= state.examMaxSeconds) {
        finishSession("time");
      }
    }, 1000);
  }

  function stopTimer() {
    if (!state.timerId) return;
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function setQuestion() {
    state.current = makeQuestion();
    state.questionAnswered = false;
    el.prompt.textContent = state.current.prompt;
    el.answer.value = "";
    el.answer.placeholder = answerPlaceholder(state.current.answerKind);
    el.answer.focus();
    if (el.type) {
      el.type.textContent = state.current.label;
    }
    if (el.feedback) {
      el.feedback.innerHTML = "";
    }
    updateControlState();
  }

  function evaluateAnswer(options = {}) {
    const { skipped = false } = options;
    if (!state.active || !state.current) return;
    if (state.questionAnswered) return;

    const expected = normalizeAnswer(state.current.answerKind, state.current.answer);
    const typed = normalizeAnswer(state.current.answerKind, el.answer.value);

    if (!skipped && typed === null) {
      feedback("status-bad", "Answer format is invalid. Correct the input or use Next to skip.");
      return;
    }

    state.questionAnswered = true;
    state.asked += 1;

    if (!skipped && typed === expected) {
      state.score += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      feedback("status-good", `Correct. ${expected}`);
    } else {
      state.streak = 0;
      const reason = skipped ? "Skipped." : "Incorrect.";
      feedback("status-bad", `${reason} Expected ${expected}`);
    }

    updateStats();
    updateControlState();

    if (state.mode === "exam" && state.asked >= state.limit) {
      finishSession("limit");
    }
  }

  async function finishSession(reason = "done") {
    if (!state.active) return;
    state.active = false;
    stopTimer();
    updateControlState();

    const percent = state.asked > 0 ? Math.round((state.score / state.asked) * 100) : 0;
    const averageSeconds = state.asked ? Math.round(state.totalSeconds / state.asked) : 0;
    const statusText = reason === "time"
      ? "Time limit reached."
      : reason === "manual"
        ? "Session ended."
        : "Session complete.";

    el.result.innerHTML = `<div class="card"><h3>${statusText}</h3><p>Score: ${state.score}/${state.asked} (${percent}%)</p><p class="muted">Mode: ${state.mode} | Difficulty: ${state.difficulty}</p><p class="muted">Time: ${el.timer.textContent} | Avg pace: ${averageSeconds}s/question</p></div>`;

    try {
      if (window.ProgressAPI) {
        await window.ProgressAPI.saveSubnetResult({
          mode: state.mode,
          difficulty: state.difficulty,
          score: state.score,
          total: state.asked,
          timeSeconds: state.totalSeconds
        });
      }
    } catch (error) {
      maybeOpenAuth(error);
      el.result.innerHTML += `<p class='status-bad'>${error.message || "Unable to save subnet result."}</p>`;
    }
  }

  function startSession() {
    stopTimer();
    state.mode = el.mode.value;
    state.difficulty = el.difficulty ? el.difficulty.value : "easy";
    state.active = true;
    state.totalSeconds = 0;
    state.asked = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.previousSignature = "";
    state.limit = state.mode === "exam" ? 15 : Infinity;
    state.examMaxSeconds = state.mode === "exam" ? 10 * 60 : Infinity;
    el.result.innerHTML = "";

    if (el.type) {
      el.type.textContent = "";
    }

    setTimerText();
    updateStats();
    updateControlState();
    startTimer();
    setQuestion();
  }

  function bindEvents() {
    el.start.addEventListener("click", startSession);

    if (el.finish) {
      el.finish.addEventListener("click", () => {
        finishSession("manual");
      });
    }

    el.submit.addEventListener("click", () => {
      evaluateAnswer();
    });

    el.next.addEventListener("click", () => {
      if (!state.active) return;
      if (!state.questionAnswered) {
        evaluateAnswer({ skipped: true });
      }
      if (!state.active) return;
      setQuestion();
    });

    el.answer.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;

      event.preventDefault();
      if (state.questionAnswered) {
        if (state.active) setQuestion();
        return;
      }

      evaluateAnswer();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimerText();
    updateStats();
    updateControlState();
    bindEvents();
  });
})();
