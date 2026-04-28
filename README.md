# ChatNest

> A production-grade, full-stack AI chat platform with **persistent memory**,
> **semantic search**, **privacy-first Incognito Mode**, **8 behavior modes**,
> **emotion-aware responses**, **public share links**, and **token-by-token
> streaming** — built on **FastAPI · Google Gemini · Qdrant · Next.js 16**.



---

## Table of Contents

1. [What is ChatNest?](#what-is-chatnest)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Prerequisites](#prerequisites)
7. [Installation — Step by Step](#installation--step-by-step)
  - [1. Clone the repository](#1-clone-the-repository)
  - [2. Backend setup (FastAPI)](#2-backend-setup-fastapi)
  - [3. Frontend setup (Next.js)](#3-frontend-setup-nextjs)
  - [4. First-run smoke test](#4-first-run-smoke-test)
8. [Environment Variables](#environment-variables)
9. [Running the App](#running-the-app)
10. [API Reference](#api-reference)
11. [Deployment](#deployment)
12. [Troubleshooting](#troubleshooting)
13. [Design Principles](#design-principles)
14. [Contributing](#contributing)
15. [License](#license)
16. [Acknowledgements](#acknowledgements)

---

## What is ChatNest?

ChatNest is a full-stack conversational AI application designed to be the
"ChatGPT you actually own." It combines a modern, streaming React UI with a
FastAPI backend that gives the LLM a real memory, a semantic search index, and
a strict privacy model — without depending on any paid managed services beyond
the Gemini API.

It is:

- **Opinionated** — pre-wired behavior modes, emotion detection, and an
incognito pipeline that is structurally isolated from the database.
- **Portable** — runs locally on SQLite + embedded Qdrant; scales to
PostgreSQL + a persistent Qdrant volume in production.
- **Hackable** — thin routers, pure service functions, typed schemas, and
Zustand stores make it easy to extend.

---

## Features

- **Multi-conversation chat** — ChatGPT-style sidebar with unlimited threads.
- **Smart Context Engine** — every reply blends *active summary + top-k
semantic hits + recent messages*, de-duplicated before being sent to Gemini.
- **Importance-aware memory compression** — every 10 messages, Gemini
summarises the oldest turns with an importance score and entity list. The
signal of a 500-message chat survives in a few hundred tokens.
- **Semantic search** — every user and assistant message is embedded with
`all-MiniLM-L6-v2` (384-dim) and stored in Qdrant with cosine similarity.
- **Global search palette** (`Ctrl+K` / `Cmd+K`) — fuses SQL `ILIKE` keyword
matching with Qdrant semantic hits; messages matched by both bubble to the
top.
- **Server-Sent-Events streaming** — tokens arrive as Gemini generates them,
with robust handling of safety stops, `MAX_TOKENS`, and recitation cuts.
- **8 behavior modes** — Default, Buddy, Concise, Expert, Creative, Coding,
Study, Emotional. Each mode ships its own system prompt *and* generation
config (temperature, token budget).
- **Emotion awareness + distress Care Override** — a rule-based detector
identifies emotions; crisis cues trigger a softer, help-oriented system
prompt.
- **Incognito Mode** — a structurally separate pipeline with **no DB writes,
no embeddings, no summaries**. In-memory only, 30 min TTL per session.
- **Public share links** — 192-bit URL-safe tokens, read-only, revocable, no
auth needed to view.
- **JWT auth** — email/password, per-user isolation, bcrypt hashing, 24 h
default lifetime.
- **PWA** — installable, mobile-safe viewport, "New chat" shortcut.

---

## Architecture

```
┌───────────────────┐     HTTPS / SSE      ┌────────────────────────────┐
│   Next.js 16 UI   │────────────────────▶│    FastAPI Application     │
│   (React 19)      │◀──── JSON / SSE ────│    RateLimiter · Logging   │
└───────────────────┘                      │    CORS · JWT Auth         │
                                           └──────────┬─────────────────┘
                                                      │
         ┌────────────────────────┬────────────────────┼────────────────────┐
         ▼                        ▼                    ▼                    ▼
┌──────────────────┐  ┌───────────────────┐  ┌────────────────────┐  ┌───────────────────┐
│ PostgreSQL /     │  │   Qdrant (local)  │  │   Google Gemini    │  │  In-Process RAM   │
│ SQLite           │  │   384-dim Cosine  │  │   gemini-2.5-flash │  │  Incognito Store  │
│ users · convos · │  │   chatnest_memory │  │   replies · titles │  │  (TTL 30m,        │
│ messages ·       │  │                   │  │   · summaries      │  │   max 20 turns)   │
│ summaries ·      │  │                   │  │                    │  │                   │
│ shares           │  │                   │  │                    │  │                   │
└──────────────────┘  └───────────────────┘  └────────────────────┘  └───────────────────┘
```

**Layering principle:** routers stay thin → delegate to pure service functions
→ services read/write models (SQL) and `vector_service` (Qdrant).

---

## Tech Stack

### Backend


| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| Framework    | FastAPI (async, typed, auto-OpenAPI)                  |
| ORM          | SQLAlchemy                                            |
| Database     | PostgreSQL (prod) / SQLite (local)                    |
| LLM          | Google Gemini — `gemini-2.5-flash`                    |
| Vector store | Qdrant (embedded, on-disk)                            |
| Embeddings   | SentenceTransformers `all-MiniLM-L6-v2` (384-dim)     |
| Auth         | JWT HS256 + bcrypt (`passlib`)                        |
| Streaming    | Server-Sent Events                                    |
| Middleware   | Custom rate-limiter (120 req / 60 s) + access logging |


### Frontend


| Layer     | Technology                                             |
| --------- | ------------------------------------------------------ |
| Framework | Next.js 16 (App Router)                                |
| Runtime   | React 19                                               |
| Language  | TypeScript 5                                           |
| State     | Zustand (auth, chat, incognito, mode, composer stores) |
| Styling   | Tailwind CSS v4                                        |
| HTTP      | Axios + interceptors (auto-attaches JWT)               |
| Markdown  | `react-markdown` + `remark-gfm`                        |
| PWA       | `manifest.webmanifest` + safe-area viewport            |


---

## Project Structure

```
ChatNest/
├── app/                              FastAPI backend
│   ├── main.py                       App factory, middleware, routers, lifespan
│   ├── deps.py                       get_db, get_current_user
│   ├── core/
│   │   ├── config.py                 .env → typed constants
│   │   ├── database.py               SQLAlchemy engine + SessionLocal
│   │   └── security.py               bcrypt + JWT helpers
│   ├── middleware/
│   │   ├── logging_middleware.py
│   │   └── rate_limiter.py
│   ├── models/                       SQLAlchemy ORM + cross-DB GUID type
│   ├── schemas/                      Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py
│   │   ├── conversations.py
│   │   ├── messages.py               Persistent + incognito, sync + SSE
│   │   ├── search.py                 Keyword · semantic · global (fused)
│   │   └── shares.py                 Owner + public routers
│   └── services/
│       ├── llm_service.py            Gemini: reply / stream / title / summary
│       ├── vector_service.py         Qdrant + SentenceTransformers singletons
│       ├── memory_service.py         Importance-aware compression
│       ├── behavior_service.py       8 modes + distress override
│       ├── emotion_service.py        Rule-based emotion + distress detection
│       └── incognito_session.py      Thread-safe in-RAM TTL store
├── frontend/                         Next.js 16 + React 19 + TS
│   ├── src/
│   │   ├── app/                      login · register · shared · root
│   │   ├── components/               Sidebar · ChatWindow · ChatInput · etc.
│   │   ├── hooks/useStreaming.ts     Persistent + incognito SSE client
│   │   ├── services/                 api · auth · chat
│   │   ├── store/                    Zustand stores
│   │   └── types/index.ts
│   └── public/                       PWA manifest + icons
├── scripts/                          Ad-hoc DB / migration helpers
├── requirements.txt                  Python dependencies
├── .env.example                      Backend env template
├── DEPLOYMENT.md                     Full production deployment guide
└── README.md                         You are here
```

---

## Prerequisites

Before you begin, make sure you have the following installed:


| Tool                  | Minimum Version | Check              | Notes                                                                                                                                                                            |
| --------------------- | --------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Python**            | 3.10            | `python --version` | 3.11 or 3.12 recommended                                                                                                                                                         |
| **pip**               | latest          | `pip --version`    | ships with Python                                                                                                                                                                |
| **Node.js**           | 20.x            | `node --version`   | Next.js 16 requires Node 20+                                                                                                                                                     |
| **npm**               | 10.x            | `npm --version`    | ships with Node                                                                                                                                                                  |
| **Git**               | any             | `git --version`    | to clone the repo                                                                                                                                                                |
| **PostgreSQL**        | 14 *(optional)* | `psql --version`   | skip if you'll use SQLite                                                                                                                                                        |
| **C/C++ build tools** | —               | —                  | needed on Windows for `bcrypt`/`psycopg2` wheels — usually handled automatically; if not, install the "Desktop development with C++" workload from the Visual Studio Build Tools |


You will also need:

- A **Google Gemini API key** — create one at
[aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
*(Free tier is sufficient for development.)*

---

## Installation — Step by Step

The instructions below assume a **Windows** machine with PowerShell (matching
this repo's current environment). Equivalent commands for macOS / Linux are
shown whenever they differ.

### 1. Clone the repository

```powershell
git clone https://github.com/<your-username>/ChatNest.git
cd ChatNest
```

> If you are starting from a local copy (e.g. this folder on your Desktop),
> skip cloning and just `cd` into the project folder.

### 2. Backend setup (FastAPI)

#### 2.1 Create and activate a Python virtual environment

From the **project root**:

**Windows (PowerShell):**

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script, run PowerShell **as Administrator**
once and execute:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**Windows (cmd):**

```cmd
python -m venv venv
venv\Scripts\activate.bat
```

**macOS / Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
```

Your prompt should now be prefixed with `(venv)`.

#### 2.2 Install Python dependencies

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

This installs FastAPI, SQLAlchemy, the Gemini SDK, Qdrant client,
SentenceTransformers, JWT + bcrypt libraries, and everything else the backend
needs.

> **First install is slow** — `sentence-transformers` pulls in PyTorch
> (~300 MB). This happens only once per virtualenv.

#### 2.3 Create your `.env` file

Copy the template:

**PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Open `.env` in your editor and set, at minimum:

```dotenv
# Use SQLite locally so you don't need Postgres running.
USE_SQLITE=1
DB_AUTO_CREATE_TABLES=1

# Required — paste your real Gemini key.
GEMINI_API_KEY=AIza...your-actual-key...

# Required — generate a strong random string.
JWT_SECRET_KEY=replace-me-with-a-long-random-string
```

Generate a strong JWT secret with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copy the output and paste it as the value of `JWT_SECRET_KEY`.

See the [Environment Variables](#environment-variables) section for the full
list of tuneable settings (Postgres, CORS, compression batch size, Qdrant
path, etc.).

#### 2.4 (Optional) Use PostgreSQL instead of SQLite

Skip this section if you are happy with SQLite for local development.

1. Make sure PostgreSQL 14+ is installed and running.
2. Create a database and a user:
  ```sql
   CREATE DATABASE chatnest;
   CREATE USER chatnest_user WITH PASSWORD 'strong-password';
   GRANT ALL PRIVILEGES ON DATABASE chatnest TO chatnest_user;
  ```
3. Update `.env`:
  ```dotenv
   USE_SQLITE=0
   DATABASE_URL=postgresql://chatnest_user:strong-password@localhost:5432/chatnest
   DB_AUTO_CREATE_TABLES=1
  ```
4. Leave `DB_AUTO_CREATE_TABLES=1` for the first boot so SQLAlchemy creates
  the tables, then set it to `0` once the schema is stable.

#### 2.5 Start the API

From the project root, with the virtualenv still active:

```powershell
uvicorn app.main:app --reload --port 8000
```

You should see logs similar to:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

Open the interactive docs at **[http://localhost:8000/docs](http://localhost:8000/docs)** — you'll get a
full Swagger UI you can use to test every endpoint without a frontend.

> **Qdrant storage** — the first time you send a chat message, Qdrant will
> create a `qdrant_storage/` folder in the project root to persist
> embeddings. It is git-ignored.

### 3. Frontend setup (Next.js)

Leave the backend running in its terminal. Open a **new terminal** in the
project root.

#### 3.1 Move into the frontend folder and install dependencies

```powershell
cd frontend
npm install
```

This pulls Next.js 16, React 19, Tailwind v4, Zustand, Axios, and the
Markdown stack.

#### 3.2 Configure the frontend environment

The frontend needs to know where the FastAPI backend lives. Create a local
env file:

**PowerShell:**

```powershell
New-Item -Path .env.local -ItemType File
Set-Content -Path .env.local -Value "NEXT_PUBLIC_API_URL=http://localhost:8000"
```

**macOS / Linux:**

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

> `NEXT_PUBLIC_` is required — Next.js only exposes env vars with that
> prefix to the browser bundle.

#### 3.3 Start the dev server

```powershell
npm run dev
```

Next.js will compile and serve at **[http://localhost:3000](http://localhost:3000)**. Open that URL
in your browser — you should see the ChatNest login screen.

### 4. First-run smoke test

1. Go to [http://localhost:3000/register](http://localhost:3000/register) and create an account.
2. You should be redirected to the main chat view with an empty sidebar.
3. Type "Hello, what can you do?" and press Enter.
4. You should see tokens stream in letter-by-letter.
5. After the reply finishes, the sidebar should auto-generate a chat title.
6. Press `Ctrl+K` (or `Cmd+K` on macOS) to open the global search palette.
7. Toggle **Incognito Mode** in the sidebar and send a message — nothing
  should appear in the persistent sidebar.
8. Open an existing chat and try **Share** — it should produce a public URL
  you can open in an incognito window without logging in.

If all eight steps succeed, your installation is complete. 🎉

---

## Environment Variables

### Backend — `.env` (in the project root)


| Variable                   | Required          | Default                   | Description                                                                      |
| -------------------------- | ----------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `USE_SQLITE`               | No                | *(empty = false)*         | Set to `1` for the SQLite file `./chatnest.db`.                                  |
| `DATABASE_URL`             | If `USE_SQLITE=0` | `sqlite:///./chatnest.db` | Full SQLAlchemy URL.                                                             |
| `DB_AUTO_CREATE_TABLES`    | No                | *(empty = false)*         | `1` to auto-run `create_all()` at startup. Turn off once your schema is managed. |
| `GEMINI_API_KEY`           | **Yes**           | —                         | Google AI Studio key.                                                            |
| `GEMINI_MODEL`             | No                | `gemini-2.5-flash`        | Gemini model id.                                                                 |
| `GEMINI_MAX_OUTPUT_TOKENS` | No                | `8192`                    | Per-reply token cap.                                                             |
| `JWT_SECRET_KEY`           | **Yes**           | `CHANGE-ME-IN-PRODUCTION` | HS256 signing secret. Generate with `secrets.token_urlsafe(64)`.                 |
| `JWT_EXPIRE_MINUTES`       | No                | `1440`                    | JWT lifetime (24 h).                                                             |
| `QDRANT_PATH`              | No                | `./qdrant_storage`        | On-disk path for the embedded Qdrant collection.                                 |
| `COMPRESSION_BATCH_SIZE`   | No                | `10`                      | Number of messages per compressed summary.                                       |
| `CORS_ALLOW_ORIGINS`       | In prod           | *(localhost defaults)*    | Comma-separated list of allowed origins.                                         |


### Frontend — `frontend/.env.local`


| Variable              | Required | Description                                                          |
| --------------------- | -------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | **Yes**  | Public URL of the FastAPI backend (`http://localhost:8000` locally). |


---

## Running the App

Once installed, the day-to-day workflow is:

**Terminal 1 — backend:**

```powershell
cd C:\path\to\ChatNest
venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend:**

```powershell
cd C:\path\to\ChatNest\frontend
npm run dev
```

Then visit [http://localhost:3000](http://localhost:3000).

### Production build (local sanity check)

```powershell
# Backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

# Frontend
cd frontend
npm run build
npm run start
```

---

## API Reference

The full, live, interactive schema is always at `/docs` (Swagger UI) and
`/redoc` when the API is running.

### Authentication


| Method | Endpoint         | Description                    |
| ------ | ---------------- | ------------------------------ |
| `POST` | `/auth/register` | Create a user → returns a JWT. |
| `POST` | `/auth/login`    | Email + password → JWT.        |
| `GET`  | `/auth/me`       | Current user profile.          |


### Conversations


| Method   | Endpoint                                 | Description                                   |
| -------- | ---------------------------------------- | --------------------------------------------- |
| `POST`   | `/conversations/`                        | Create a new conversation.                    |
| `GET`    | `/conversations/`                        | List the current user's active conversations. |
| `GET`    | `/conversations/{id}?page=N&page_size=M` | Paginated history.                            |
| `PATCH`  | `/conversations/{id}`                    | Rename or archive.                            |
| `DELETE` | `/conversations/{id}`                    | Cascade-delete + purge Qdrant points.         |


### Messages


| Method   | Endpoint                                  | Description                                 |
| -------- | ----------------------------------------- | ------------------------------------------- |
| `POST`   | `/message/`                               | Send a message, get the full reply as JSON. |
| `POST`   | `/message/stream`                         | Send a message, stream the reply via SSE.   |
| `PUT`    | `/message/{id}/edit`                      | Edit a message's content.                   |
| `DELETE` | `/message/{id}`                           | Soft-delete a message.                      |
| `DELETE` | `/message/incognito/session/{session_id}` | Forget an incognito session.                |


### Search


| Method | Endpoint                                   | Description                                                   |
| ------ | ------------------------------------------ | ------------------------------------------------------------- |
| `GET`  | `/search/keyword/{conversation_id}?query=` | SQL `ILIKE` in one conversation.                              |
| `GET`  | `/search/semantic?query=&top_k=`           | Qdrant vector similarity.                                     |
| `GET`  | `/search/global?q=&limit=`                 | **Fused** keyword + semantic across all user's conversations. |


### Sharing


| Method   | Endpoint                    | Description                               |
| -------- | --------------------------- | ----------------------------------------- |
| `POST`   | `/conversations/{id}/share` | Create or return existing share link.     |
| `GET`    | `/conversations/{id}/share` | Current share status.                     |
| `DELETE` | `/conversations/{id}/share` | Revoke share.                             |
| `GET`    | `/shared/{token}`           | **Public**, read-only snapshot (no auth). |


### Health


| Method | Endpoint                                                            |
| ------ | ------------------------------------------------------------------- |
| `GET`  | `/` → `{ status: "ok", service: "ChatNest API", version: "2.0.0" }` |


---

## Deployment

A detailed, screenshot-friendly production deployment walkthrough lives in
`[DEPLOYMENT.md](./DEPLOYMENT.md)`. It covers pushing to GitHub, provisioning
a Neon Postgres, deploying the FastAPI backend to Render with a persistent
disk for Qdrant, and hosting the Next.js frontend on Vercel.

**Recommended free-tier stack:**

- **Frontend** → [Vercel](https://vercel.com) (1-click Next.js deploy).
- **Backend** → [Render](https://render.com) (free web service + 1 GB disk).
- **Database** → [Neon](https://neon.tech) or Render's free Postgres.
- **Vector store** → embedded Qdrant on the backend disk, or
[Qdrant Cloud](https://cloud.qdrant.io) free tier for larger scale.

### High-level checklist

1. Push the repo to GitHub.
2. Provision Postgres, copy the connection string.
3. Deploy FastAPI to Render with `.env` values set in the dashboard.
  - Build command: `pip install -r requirements.txt`
  - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - Add a persistent disk mounted at `/var/data`, point `QDRANT_PATH` at it.
4. Deploy Next.js to Vercel with `NEXT_PUBLIC_API_URL` set to your Render URL.
5. Set `CORS_ALLOW_ORIGINS` on the backend to your Vercel URL, then redeploy.
6. Rotate any secrets that ever touched a git commit.

---

## Troubleshooting


| Symptom                                            | Likely Cause                                                                                 | Fix                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ModuleNotFoundError: app` when running uvicorn    | Running from the wrong folder or without the venv active                                     | Activate the venv and run from the project root.                                                       |
| `google.generativeai.types.BlockedPromptException` | Safety filter tripped on a prompt                                                            | Try rephrasing; in code this is caught and surfaced as a friendly message.                             |
| CORS errors in the browser console                 | `CORS_ALLOW_ORIGINS` missing your frontend URL                                               | Add the origin, restart the API.                                                                       |
| "Network Error" in the UI but no backend log       | Uvicorn not running, wrong `NEXT_PUBLIC_API_URL`, or a mixed-content (http / https) mismatch | Check the URL and whether the backend is up.                                                           |
| `sentence-transformers` download stuck             | First run downloading MiniLM (~90 MB)                                                        | Wait it out; it's cached to `~/.cache/huggingface/` afterwards.                                        |
| Qdrant dimension mismatch                          | Old on-disk collection from a different embedding model                                      | Delete `qdrant_storage/` and restart — code auto-heals but a manual clean is the fastest path locally. |
| `psycopg2` wheel install fails on Windows          | Missing C build toolchain                                                                    | Install Visual Studio Build Tools → "Desktop development with C++".                                    |
| JWT errors after `.env` changes                    | `JWT_SECRET_KEY` changed, invalidating old tokens                                            | Log out and log back in.                                                                               |
| `EACCES` / permission errors on `npm install`      | npm cache owned by another user                                                              | `npm cache clean --force`, then retry.                                                                 |
| `bcrypt` errors on Linux                           | Missing `libffi-dev`                                                                         | `sudo apt-get install -y libffi-dev build-essential`.                                                  |


More deployment-specific issues live in the troubleshooting table at the bottom of `[DEPLOYMENT.md](./DEPLOYMENT.md)`.

---

## Design Principles

- **Routers stay thin.** Every router file does parsing, authorisation, and
persistence — all heavy lifting is delegated to `app/services/`*.
- **Incognito is structural, not a flag.** Incognito handlers take *no DB
session* and *no `BackgroundTasks`* — privacy is enforced by the shape of
the code.
- **Context is ranked and de-duplicated.** Summary > semantic hits > recent
messages; no message is ever sent to the LLM twice in the same turn.
- **Per-user isolation.** Allowed conversation IDs are always derived
server-side from the JWT claim, never trusted from the client.
- **Graceful LLM edge cases.** All Gemini responses pass through
`_safe_chunk_text` and `_finish_reason_from_chunk`, so safety blocks,
`MAX_TOKENS`, and recitation cuts never crash the stream.
- **Portable UUIDs.** A custom `GUID` SQLAlchemy type gives native UUIDs on
Postgres and `CHAR(32)` on SQLite, so the same model works in both.

---

## Contributing

Pull requests are welcome. Before opening one:

1. Run the backend locally and make sure `/docs` still loads.
2. Run `npm run lint` in `frontend/` and `npm run build` to catch type errors.
3. Keep routers thin — put new logic in `app/services/` so it's unit-testable.
4. Add or update documentation in this README if your change affects setup.

---

## License

This project is released under the **MIT License**. Add a `LICENSE` file at
the repo root if you plan to open-source. Third-party licenses (Gemini SDK,
Qdrant, FastAPI, Next.js, etc.) are retained by their respective projects.

---

## Acknowledgements

- [Google Gemini](https://ai.google.dev/) — the LLM powering replies,
summaries, and auto-titles.
- [Qdrant](https://qdrant.tech/) — the embedded vector store that makes
semantic search one-command local.
- [SentenceTransformers](https://www.sbert.net/) — `all-MiniLM-L6-v2`
embeddings.
- [FastAPI](https://fastapi.tiangolo.com/) and
[Next.js](https://nextjs.org/) — the stack that makes this fun to build.
- Everyone building in the open-source AI ecosystem. 🙌

