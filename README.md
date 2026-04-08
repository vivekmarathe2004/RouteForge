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
- Shared auth modal with password show/hide, confirm-password validation, caps-lock warnings, live password guidance, and email OTP verification.
- Auth is enforced as one account per email address.

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
- Supabase Auth + Supabase Postgres for production user/auth/progress storage
- Vanilla HTML, CSS, and JavaScript
- Server-side session cookies on top of Supabase Auth
- `serverless-http` for serverless adapters

---

**Quick Start**
1. Install dependencies:

```bash
npm install
```

2. Start the server:

Create a local `.env` from `.env.example` first:

```bash
copy .env.example .env
```

Set these values before using auth or synced progress:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=your-server-only-supabase-secret
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
AUTH_ACCESS_COOKIE_NAME=routeforge_access_token
AUTH_REFRESH_COOKIE_NAME=routeforge_refresh_token
AUTH_SESSION_MAX_AGE_MS=604800000
PORT=3000
```

New registrations now require email OTP verification, so Supabase email delivery must be configured for your project.
In the Supabase Auth `Confirm signup` email template, use `{{ .Token }}` for the verification code and remove the confirmation link if you want a code-only email.

Before you run the app, execute [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor to create the production tables RouteForge expects.

Then start the server:

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
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session
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
POST   /api/progress/lab-steps
POST   /api/progress/lab-steps/reset
POST   /api/progress/reset
GET    /api/dashboard
```

Health check:

```
GET /health
```

---

**Data & Persistence**
Learning content still lives in `data/` as read-only JSON. User accounts, quiz history, subnet history, lab completions, and synced lab step progress now live in PostgreSQL.

Production data is stored in Supabase Auth plus these app tables:
- `profiles`
- `quiz_attempts`
- `subnet_attempts`
- `lab_completions`
- `lab_step_progress`

---

**Project Structure**
```
RouteForge/
  server/
    server.js
    api.js
    config.js
    auth.js
    progress-store.js
    supabase.js
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
  api/
    [...path].js
  supabase/
    schema.sql
```

---

**Deploy**
- Vercel: import repo, choose framework preset `Other`, and set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and preferably `SUPABASE_PUBLISHABLE_KEY` in Project Settings before deploying.
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
