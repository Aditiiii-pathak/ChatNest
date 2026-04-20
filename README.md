# ChatNest

> A production-grade, full-stack AI chat platform with **persistent memory**,
> **semantic search**, **privacy-first Incognito Mode**, **8 behavior modes**,
> **emotion-aware responses**, **public share links**, and **token-by-token
> streaming** — built on **FastAPI + Google Gemini + Qdrant + Next.js 16**.

---

## ✨ Features

- **Multi-conversation chat** — ChatGPT-style sidebar, unlimited threads.
- **Smart Context Engine** — every reply combines *recent + semantic + summary* context.
- **Importance-aware memory compression** — Gemini summarises old messages every 10 turns; the signal of a 500-message chat fits in a few hundred tokens.
- **Semantic search** — find messages by meaning via Qdrant + `all-MiniLM-L6-v2` embeddings.
- **Global search palette** (`⌘K` / `Ctrl+K`) — fuses keyword + semantic across all your chats.
- **SSE streaming replies** — tokens arrive as Gemini generates them.
- **8 behavior modes** — Default, Buddy, Concise, Expert, Creative, Coding, Study, Emotional.
- **Emotion awareness** — rule-based detector + distress "Care Override" that softens tone and handles crisis cues.
- **Incognito Mode** — a structurally separate pipeline with **no DB writes, no embeddings, no summaries**. In-memory only, 30 min TTL.
- **Public share links** — read-only, revocable, 192-bit token, no auth required to view.
- **JWT auth** — email/password, per-user isolation, bcrypt hashing.
- **PWA** — installable, mobile-safe, "New chat" shortcut.

---

## 🏗️ Architecture

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
│ users · convos · │  │   chatnest_memory │  │   replies · titles │  │  (TTL 30m)        │
│ messages ·       │  │                   │  │   · summaries      │  │                   │
│ summaries · shares│  │                  │  │                    │  │                   │
└──────────────────┘  └───────────────────┘  └────────────────────┘  └───────────────────┘
```

**Layering:** thin routers → services (pure business logic) → models + vector service.

---

## 🧰 Tech Stack

**Backend** — FastAPI · SQLAlchemy · PostgreSQL / SQLite · Google Gemini (`gemini-2.5-flash`) · Qdrant · SentenceTransformers (`all-MiniLM-L6-v2`) · JWT (HS256) · bcrypt · SSE

**Frontend** — Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS v4 · Zustand · Axios · react-markdown

---

## 📁 Project Structure

```
ChatNest/
├── app/                        FastAPI backend
│   ├── main.py                 App entrypoint, middleware, routers
│   ├── core/                   Config, DB engine, security
│   ├── models/                 SQLAlchemy models
│   ├── schemas/                Pydantic request/response schemas
│   ├── routers/                auth · conversations · messages · search · shares
│   ├── services/               behavior · emotion · llm · memory · vector · incognito
│   └── middleware/             rate_limiter · logging
├── frontend/                   Next.js 16 client
│   ├── src/                    App Router, components, stores
│   ├── public/                 PWA manifest, icons
│   └── package.json
├── scripts/                    DB sync helpers
├── requirements.txt            Python dependencies
├── .env.example                Backend env template
└── frontend/.env.example       Frontend env template
```

---

## 🚀 Local Development

### Prerequisites

- **Python** 3.10+
- **Node.js** 20+
- **PostgreSQL** 14+ *(optional — SQLite works out of the box)*
- A **Google Gemini API key** → [aistudio.google.com](https://aistudio.google.com/app/apikey)

### 1. Clone & enter the project

```bash
git clone https://github.com/<your-username>/ChatNest.git
cd ChatNest
```

### 2. Backend setup

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

Copy the env template and fill in your keys:

```bash
# Windows PowerShell
Copy-Item .env.example .env
# macOS / Linux
cp .env.example .env
```

Edit `.env` and at minimum set `GEMINI_API_KEY` and `JWT_SECRET_KEY`. Keep
`USE_SQLITE=1` for the fastest possible start.

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive Swagger UI.

### 3. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🔐 Environment Variables

### Backend (`.env`)

| Variable | Required | Description |
|---|---|---|
| `USE_SQLITE` | No | `1` to use SQLite (`./chatnest.db`). Default `0`. |
| `DATABASE_URL` | If `USE_SQLITE=0` | Full Postgres URL. |
| `DB_AUTO_CREATE_TABLES` | No | `1` to auto-create tables on startup. |
| `GEMINI_API_KEY` | **Yes** | Google AI Studio key. |
| `GEMINI_MODEL` | No | Default `gemini-2.5-flash`. |
| `JWT_SECRET_KEY` | **Yes** | Long random string. |
| `JWT_EXPIRE_MINUTES` | No | Default `1440` (24 h). |
| `QDRANT_PATH` | No | Local embedded Qdrant storage path. |
| `CORS_ALLOW_ORIGINS` | In prod | Comma-separated list of allowed frontend origins. |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Public URL of your FastAPI backend. |

---

## 📡 Key API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/signup` | Create account |
| `POST` | `/auth/login` | Get JWT |
| `GET`  | `/conversations` | List user's chats |
| `POST` | `/conversations` | Create a chat |
| `POST` | `/message` | Send message (non-streaming) |
| `POST` | `/message/stream` | Send message (SSE streaming) |
| `GET`  | `/search/global?q=...` | Fused keyword + semantic search |
| `POST` | `/conversations/{id}/share` | Create public share link |
| `GET`  | `/shared/{token}` | Public read-only share view |
| `GET`  | `/` | Health check |

Full schema available at `/docs` when the API is running.

---

## 🚢 Deployment

See the **Deployment Guide** in the root of this repo or follow the high-level
steps below.

**Recommended free-tier stack:**

- **Frontend** → [Vercel](https://vercel.com) (1-click Next.js deploy)
- **Backend** → [Render](https://render.com) (free web service)
- **Database** → [Neon](https://neon.tech) or Render's free Postgres
- **Vector store** → Keep embedded Qdrant on the backend disk, or use [Qdrant Cloud](https://cloud.qdrant.io) free tier

### Quick checklist

1. Push to GitHub (see below).
2. Create a Postgres database, grab its connection URL.
3. Deploy FastAPI to Render with env vars from `.env.example`.
4. Deploy Next.js to Vercel; set `NEXT_PUBLIC_API_URL` to your Render URL.
5. Set `CORS_ALLOW_ORIGINS` on the backend to your Vercel URL.
6. Rotate any secrets that ever touched a commit.

---

## 🧠 Design Principles

- **Routers stay thin.** All business logic lives in `app/services/`.
- **Incognito is structural.** The handler takes no DB session — privacy is enforced by the code's shape, not a flag.
- **Context is ranked.** Summary > semantic hits > recent messages; de-duplicated before every call.
- **Per-user isolation.** Allowed conversation IDs are always derived server-side from the JWT, never trusted from the client.

---

## 📝 License

MIT — see `LICENSE` (add one if you plan to open-source).

---

## 🙌 Acknowledgements

- [Google Gemini](https://ai.google.dev/) for the LLM.
- [Qdrant](https://qdrant.tech/) for the embedded vector store.
- [SentenceTransformers](https://www.sbert.net/) for `all-MiniLM-L6-v2`.
- [FastAPI](https://fastapi.tiangolo.com/) and [Next.js](https://nextjs.org/) — the stack that makes this fun to build.
