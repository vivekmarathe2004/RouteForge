<div align="center">
  <h1>RouteForge</h1>
  <p>CCNA + CCNP learning platform with labs, CLI practice, topology builder, calculators, and structured modules.</p>
  <p><strong>Built for focused study:</strong> learn, practice, validate, repeat.</p>
</div>

---

## Table of Contents
1. Overview
2. Key Features
3. Modules
4. Quick Start
5. Project Structure
6. Deploy
7. Data & Persistence
8. Contributing
9. License

---

## Overview
RouteForge is a lightweight, browser-first networking lab environment that blends structured learning with hands-on practice. It includes a CCNA/CCNP command reference, labs with auto-validation, and an interactive topology builder so users can connect devices and practice real CLI workflows.

---

## Key Features
- Structured CCNA/CCNP learning modules with real CLI examples
- CCNA/CCNP command reference with filters and explanations
- Interactive CLI simulator with searchable command DB
- Drag-and-drop topology builder with cable types + port-level wiring
- Labs with auto-validation using CLI history
- Subnet trainer + networking calculators
- Flashcards, quizzes, and cheat sheets
- Dashboard with daily question and progress tracking

---

## Modules
- **Dashboard**: daily study flow, progress, recommendations
- **Learn**: structured modules + command reference
- **Labs**: step-by-step CLI practice with validation
- **CLI**: simulator + command search
- **Topology**: wiring practice with ports and cable types
- **Tools**: subnet trainer, calculators, flashcards, cheat sheets

---

## Quick Start
```bash
npm install
npm start
```
Open `http://localhost:3000`.

---

## Project Structure
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

## Deploy

### Vercel
1. Push to GitHub.
2. Import repo in Vercel.
3. Framework preset: `Other`.
4. Deploy.

Notes:
- Vercel serves `public/` as static assets.
- `/api/*` routes are handled by `api/[...path].js`.
- File writes (e.g., `data/progress.json`) do not persist on Vercel.

### Render
Use the included `render.yaml` or:
- Build command: `npm install`
- Start command: `npm start`

### Railway
- Deploy from GitHub
- Start command: `npm start`

### Netlify
Netlify config is included, but API handling requires functions.
If you want Netlify deployment, I can align it to the current Express layout.

---

## Data & Persistence
Progress is stored in `data/progress.json` for local use.
For production persistence, use a database or Vercel KV/Supabase/Postgres.

---

## Contributing
1. Fork the repo
2. Create a feature branch
3. Open a PR

---

## License
MIT