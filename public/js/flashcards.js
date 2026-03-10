(function () {
  if (document.body.dataset.page !== "flashcards") return;

  const state = {
    cards: [],
    index: 0,
    randomMode: false
  };

  const el = {
    category: document.getElementById("flashcard-category"),
    count: document.getElementById("flashcard-count"),
    front: document.getElementById("flashcard-front"),
    back: document.getElementById("flashcard-back"),
    card: document.getElementById("flashcard"),
    prev: document.getElementById("flashcard-prev"),
    next: document.getElementById("flashcard-next"),
    shuffle: document.getElementById("flashcard-shuffle"),
    random: document.getElementById("flashcard-random")
  };

  function render() {
    if (!state.cards.length) {
      el.front.textContent = "No cards";
      el.back.textContent = "Add flashcards to start.";
      el.count.textContent = "0/0";
      return;
    }

    const card = state.cards[state.index];
    el.front.textContent = card.front;
    el.back.textContent = card.back;
    el.count.textContent = `${state.index + 1}/${state.cards.length} | ${card.category}`;
    el.card.classList.remove("is-flipped");
  }

  function shuffleCards() {
    state.cards = [...state.cards].sort(() => Math.random() - 0.5);
    state.index = 0;
    render();
  }

  function nextCard() {
    if (!state.cards.length) return;
    if (state.randomMode) {
      state.index = Math.floor(Math.random() * state.cards.length);
    } else {
      state.index = (state.index + 1) % state.cards.length;
    }
    render();
  }

  function prevCard() {
    if (!state.cards.length) return;
    state.index = (state.index - 1 + state.cards.length) % state.cards.length;
    render();
  }

  async function loadCards() {
    const response = await fetch("/api/flashcards");
    const cards = await response.json();

    state.cards = cards;
    const categories = ["All", ...new Set(cards.map((card) => card.category))];
    el.category.innerHTML = categories.map((cat) => `<option value="${cat}">${cat}</option>`).join("");

    render();
  }

  function bindEvents() {
    el.card.addEventListener("click", () => el.card.classList.toggle("is-flipped"));
    el.next.addEventListener("click", nextCard);
    el.prev.addEventListener("click", prevCard);

    el.shuffle.addEventListener("click", shuffleCards);

    el.random.addEventListener("click", () => {
      state.randomMode = !state.randomMode;
      el.random.textContent = state.randomMode ? "Random: ON" : "Random: OFF";
    });

    el.category.addEventListener("change", async () => {
      const allCards = await (await fetch("/api/flashcards")).json();
      const value = el.category.value;
      state.cards = value === "All" ? allCards : allCards.filter((card) => card.category === value);
      state.index = 0;
      render();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await loadCards();
      bindEvents();
    } catch (error) {
      el.front.textContent = "Failed to load flashcards.";
      el.back.textContent = error.message;
    }
  });
})();
