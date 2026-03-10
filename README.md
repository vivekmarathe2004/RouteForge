# RouteForge

RouteForge is a browser-first CCNA/CCNP learning platform that combines structured study with hands-on practice. It ships with guided labs, a CLI simulator, a topology builder, subnet training, and daily progress tracking.

---

**Highlights**
- Structured CCNA and CCNP learning modules with real CLI examples.
- Interactive labs with step-by-step validation using CLI history.
- CLI simulator with a searchable command database.
- Drag-and-drop topology builder with cable types and port-level wiring.
- Subnet trainer, calculators, flashcards, quizzes, and cheat sheets.
- Dashboard with daily questions, recommendations, and progress insights.

---

**Modules**
- Dashboard
- Learn
- Labs
- CLI Simulator
- Topology Builder
- Tools (subnet trainer, calculators, flashcards, cheat sheets)

---

**Tech Stack**
- Node.js (>=18)
- Express (API + static hosting)
- Vanilla HTML, CSS, and JavaScript
- `serverless-http` for serverless adapters

---

**Quick Start**
1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open in your browser:

```
http://localhost:3000
```

---

**Scripts**
- `npm start`: start the Express server.
- `npm run dev`: same as `start` (simple local dev mode).
- `npm run generate:practice`: generate practice data.
- `npm run validate:practice`: validate practice data.

---

**API Overview**
All API routes are served under `/api`.

```
GET    /api/topics?track=ccna|ccnp
GET    /api/topics/:id
GET    /api/quizzes?level=...&count=...
GET    /api/quiz-bank?level=...&topic=...&q=...&page=...&pageSize=...
GET    /api/daily-question
GET    /api/subnet-questions?difficulty=...
GET    /api/labs
GET    /api/flashcards
GET    /api/cli-commands?q=...
GET    /api/progress
POST   /api/progress/quiz
POST   /api/progress/subnet
POST   /api/progress/lab
POST   /api/progress/reset
GET    /api/dashboard
```

Health check:

```
GET /health
```

---

**Data & Persistence**
Progress and content data live in `data/`. Local development writes to `data/progress.json`. For production, use a real database or a hosted key-value store because file writes do not persist on most serverless deployments.

---

**Project Structure**
```
RouteForge/
  server/
    server.js
    api.js
  public/
    index.html
    learn.html
    quizzes.html
    subnet-trainer.html
    calculators.html
    labs.html
    flashcards.html
    cli-simulator.html
    topology-builder.html
    cheat-sheets.html
    css/
      styles.css
    js/
      main.js
      quiz-engine.js
      subnet-engine.js
      calculators.js
      flashcards.js
      cli-simulator.js
      topology-builder.js
      progress.js
  data/
    ccna-topics.json
    ccnp-topics.json
    quiz-bank.json
    labs.json
    flashcards.json
    cli-commands.json
    subnet-questions.json
    progress.json
  api/
    [...path].js
```

---

**Deploy**
- Vercel: import repo, choose framework preset `Other`, deploy.
- Render: build `npm install`, start `npm start`.
- Railway: start `npm start`.
- Netlify: static hosting is fine, but API needs functions to match the Express endpoints.

---

**Contributing**
1. Fork the repo.
2. Create a feature branch.
3. Open a PR.

---

**License**
MIT