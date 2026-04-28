# ChatNest — Deep Project Document (PPT-Ready)

> This single document is designed to be dropped into any "Doc → PPT" tool
> (Gamma, Tome, ChatGPT, Copilot, etc.). Every section below maps to one or
> more slides. Headings, tables, and bullet points are already shaped so the
> generator has minimal ambiguity.

---

## 1. One-Line Pitch

**ChatNest is a production-grade, full-stack AI chat platform** — a
ChatGPT-style web app with **persistent memory**, **semantic search**,
**privacy-first Incognito Mode**, **8 behavior modes**, **emotion-aware
responses**, **public share links**, and **token-by-token streaming** — built
on **FastAPI + Google Gemini + Qdrant + Next.js 16**.

---

## 2. Problem & Goal (Slide: "Why ChatNest?")

**Problems with vanilla LLM chat UIs today:**

1. **No long-term memory** — old context gets silently dropped when the window
   overflows.
2. **No search** — finding "that thing I said last week" is impossible.
3. **One-size-fits-all tone** — a coding question and a panic-attack message
   get the same corporate reply.
4. **Privacy is all-or-nothing** — either everything is stored or nothing is.
5. **No safe way to share a chat** — screenshots leak metadata and timestamps.

**ChatNest's goal:**

> Build a ChatGPT-class chat experience where **memory, privacy, tone, and
> sharing are first-class features**, not afterthoughts.

---

## 3. High-Level Product Summary (Slide: "What it Does")

| Capability | What it Means for the User |
|---|---|
| Multi-conversation chat | ChatGPT-style sidebar, unlimited threads. |
| Persistent memory | The bot remembers facts, preferences, and decisions across weeks. |
| Smart Context Engine | Every reply combines *recent + semantic + summary* context. |
| Semantic search | Find messages by meaning, not just keyword. |
| Global + keyword search | Palette (`⌘K` / `Ctrl+K`) across ALL conversations. |
| Streaming replies | Tokens arrive as they're generated (Server-Sent Events). |
| 8 behavior modes | Buddy, Concise, Expert, Creative, Coding, Study, Emotional, Default. |
| Emotion awareness | Detects user mood and softens tone; distress override for crisis cues. |
| Incognito Mode | Fully volatile chat — no DB, no embeddings, no summaries. |
| Public share links | Read-only, revocable, token-based links (no auth needed to view). |
| Auth + JWT | Email/password signup, JWT bearer tokens, per-user data isolation. |
| PWA | Installable, "New chat" shortcut, mobile-safe viewport. |

---

## 4. Tech Stack (Slide: "Architecture Stack")

### Backend (FastAPI / Python)

| Layer | Technology | Why |
|---|---|---|
| Framework | **FastAPI** | Async, typed, auto-generated OpenAPI docs. |
| ORM / DB | **SQLAlchemy** + PostgreSQL / SQLite | Portable (dev: SQLite, prod: Postgres). |
| LLM | **Google Gemini** (`gemini-2.5-flash`) | Fast, cheap, thinking-capable. |
| Vector Store | **Qdrant** (local, persistent) | Embedded; no separate server to run. |
| Embeddings | **SentenceTransformers `all-MiniLM-L6-v2`** (384-dim) | Small, fast, offline. |
| Auth | **JWT** (HS256) + **bcrypt** via passlib | Stateless, industry standard. |
| Streaming | **Server-Sent Events (SSE)** | Simpler than WebSockets for one-way streaming. |
| Middleware | Custom **RateLimiter** + **Logging** | Per-IP sliding window, access logs. |
| Config | `python-dotenv` | Centralized in `app/core/config.py`. |

### Frontend (Next.js)

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, React 19) |
| Language | **TypeScript 5** |
| State | **Zustand** (separate stores for chat / incognito / mode / auth / composer) |
| Styling | **Tailwind CSS v4** |
| HTTP | **Axios** with interceptors (auto-attaches JWT) |
| Markdown | **react-markdown** + **remark-gfm** |
| PWA | `manifest.webmanifest` + safe-area-aware viewport |

---

## 5. System Architecture (Slide: "How It All Fits Together")

```
┌───────────────────┐     HTTPS / SSE      ┌────────────────────────────┐
│   Next.js 16 UI   │────────────────────▶│    FastAPI Application     │
│   (React 19)      │◀──── JSON / SSE ────│                            │
└───────────────────┘                      │  Middleware:               │
        │                                   │   • RateLimiter (120/min)  │
        │  Zustand stores                   │   • Logging                │
        │  (chat, incognito, mode,          │   • CORS                   │
        │   auth, composer)                 │                            │
        ▼                                   │  Routers:                  │
  localStorage(JWT)                         │   /auth                    │
                                            │   /conversations           │
                                            │   /message + /message/stream│
                                            │   /search (kw/semantic/global)│
                                            │   /conversations/{id}/share │
                                            │   /shared/{token} (public) │
                                            └──────────┬─────────────────┘
                                                       │
         ┌────────────────────────┬────────────────────┼────────────────────┐
         ▼                        ▼                    ▼                    ▼
 ┌──────────────────┐  ┌───────────────────┐  ┌────────────────────┐  ┌───────────────────┐
 │ PostgreSQL /     │  │   Qdrant (local)  │  │   Google Gemini    │  │  In-Process RAM   │
 │ SQLite           │  │   384-dim Cosine  │  │   gemini-2.5-flash │  │  Incognito Store  │
 │                  │  │   Collection:     │  │                    │  │  (TTL 30 min,     │
 │ users            │  │   chatnest_memory │  │  • reply generation│  │   max 20 turns)   │
 │ conversations    │  │                   │  │  • title synthesis │  │                   │
 │ messages         │  │  Payload:         │  │  • memory summary  │  │  No persistence.  │
 │ conversation_    │  │   msg_id, convo_id│  │                    │  │                   │
 │   summaries      │  │   role, content   │  │                    │  │                   │
 │ conversation_    │  │                   │  │                    │  │                   │
 │   shares         │  │                   │  │                    │  │                   │
 └──────────────────┘  └───────────────────┘  └────────────────────┘  └───────────────────┘
```

**Layering principle:** *routers* are thin → delegate to *services* (pure
business logic) → which read/write *models* (SQL) + *vector_service* (Qdrant).

---

## 6. Core Feature Deep-Dives

### 6.1 Smart Context Engine (Slide: "Our Memory Secret Sauce")

Every persistent reply is built from **three context sources**, ranked:

| Priority | Source | Purpose |
|---|---|---|
| 1 | **Active compressed summary** | Long-term memory — preserved facts, preferences, decisions. |
| 2 | **Top-3 semantic hits (Qdrant)** | Relevant past messages, by meaning. |
| 3 | **Recent conversation messages** | Normal short-term flow. |

The engine (`_build_smart_context` in `app/routers/messages.py`) de-duplicates
semantic hits that already exist in recent messages so we never repeat context
to the model.

### 6.2 Importance-Aware Memory Compression (Slide: "Never Forgets")

- **Trigger:** every `COMPRESSION_BATCH_SIZE = 10` uncompressed messages.
- **Process:**
  1. Pick oldest 10 uncompressed messages.
  2. Send to Gemini with a **structured prompt** asking for: summary +
     `importance_score (1-10)` + `key_entities[]`.
  3. Store result as `ConversationSummary` (versioned; older versions deactivated).
  4. Mark those messages `is_compressed = True`.
  5. Update `conversation.current_summary_id`.
- **What gets preserved:** user preferences, stated facts, decisions, names,
  locations, technical details, action items.
- **What's removed:** filler, greetings, repetitive exchanges.

**Why it matters:** the model keeps the *signal* of a 500-message chat in a
few hundred tokens.

### 6.3 Semantic Search (Qdrant + MiniLM)

- Every user + assistant message is embedded with `all-MiniLM-L6-v2` (384-dim).
- Stored in Qdrant with payload: `{message_id, conversation_id, role, content}`.
- Cosine similarity, configurable `score_threshold` (default `0.35`).
- Singleton Qdrant client + encoder — loaded once, reused forever.
- Dimension-mismatch auto-heal: if the on-disk collection has a different
  vector size, it's dropped and recreated.

### 6.4 Global Search Palette (⌘K / Ctrl+K)

A single endpoint (`GET /search/global?q=...`) **fuses two strategies**:

1. **Keyword** — SQL `ILIKE` across every conversation the user owns.
2. **Semantic** — Qdrant cosine similarity, scoped to the user's convo IDs.

Results are merged on `message_id`. Hits that appear in **both** strategies
get a score boost and bubble to the top with `match_type = "both"`.

Cross-user leakage is structurally impossible — allowed IDs are computed
server-side from the JWT user.

### 6.5 Incognito Mode (Slide: "Privacy, Structurally Enforced")

Not a flag — a **completely separate pipeline**.

| Guarantee | How it's Enforced |
|---|---|
| No SQL writes | Incognito handler takes **no `Session` dependency**. |
| No embeddings | `store_embedding` is never called on the incognito path. |
| No summaries | `compress_old_messages` is never scheduled. |
| No past context | `semantic_context=None`, `summary=None` passed to LLM. |
| Optional ephemeral history | In-process dict keyed by `session_id`, TTL 30 min, max 20 turns, max 10k sessions. |
| Tab-local frontend state | Lives in its own `useIncognitoStore`; wiped on tab close. |

The privacy contract is encoded in the **structure** of the code, not comments
— the incognito endpoints physically **cannot** reach the DB.

### 6.6 Behavior Engine — 8 Modes (Slide: "Pick a Personality")

Pure, stateless function (`app/services/behavior_service.py`).

| Mode | When to Use | Temp | Style |
|---|---|---|---|
| **default** | Everyday | 0.70 | Clear, structured, short paragraphs. |
| **buddy** | Casual chat | 0.85 | Texting-friend voice, 1–3 sentences, no bullets. |
| **emotional** | Support / venting | 0.70 | Empathy-first, calm pacing, validates before advising. |
| **concise** | Power users | 0.30 | < 60 words, zero preamble, bottom-line first. |
| **expert** | Domain pros | 0.40 | Assumes knowledge, edge cases, trade-offs, numbers. |
| **creative** | Writing / ideas | 0.95 | Vivid imagery, multiple angles, playful. |
| **coding** | Dev work | 0.30 | Code-first, minimal prose, language-tagged blocks. |
| **study** | Learning | 0.65 | Socratic — examples → intuition → 1 nudge question. |

### 6.7 Emotion Detection + Distress Override

- **`detect_emotion()`** — rule-based lexicon + emoji + punctuation pressure
  → returns one of: `neutral / happy / sad / angry / anxious / curious /
  frustrated`.
- **`detect_distress()`** — stricter check for severe cues (depression,
  burnout, suicidal ideation, self-harm).
- Both are **pure functions** — no I/O, never raise, safe for the Incognito
  pipeline.
- When distressed, a **Care Override** is appended to the system prompt that:
  - Drops brevity rules for that turn,
  - Acknowledges specifically (no "I hear you" clichés),
  - Asks ONE gentle follow-up,
  - Softly mentions professional help,
  - Explicitly handles suicidal ideation cues.

### 6.8 SSE Streaming (Slide: "Why It Feels Fast")

- Endpoint: `POST /message/stream` (works in both persistent + incognito).
- Each token chunk: `data: {"content": "..."}`.
- Final event: `data: {"done": true, "message_id": "<uuid>"}`
  (or `{"done": true, "incognito": true, "emotion": "sad"}`).
- **Robust chunk parsing** (`_safe_chunk_text`) handles metadata-only chunks
  that Gemini emits on `finish_reason = MAX_TOKENS / SAFETY / RECITATION`.
- **Truncation hints** append a user-visible note when the reply was cut off.
- **Auto-title event** — after the first assistant reply of a fresh chat, an
  extra SSE event `{title_updated: true, title: "..."}` pushes the
  auto-generated title so the sidebar updates without a refetch.

### 6.9 Public Share Links

- `POST /conversations/{id}/share` → creates/returns a **192-bit URL-safe
  token**.
- `GET /shared/{token}` → **no auth required**, read-only snapshot (title +
  messages + timestamps). Never leaks user or conversation IDs.
- `DELETE /conversations/{id}/share` → revokes; re-sharing issues a **fresh
  token**.
- **Incognito messages are never persisted** so they can never leak through
  shares. The share view reads rows only from the `messages` table.

### 6.10 Auto-Title Generation (Slide: "Smart Names, Not 'New Chat'")

- First user message → Gemini is prompted with strict rules:
  - 4–9 words, capture topic + goal + tech.
  - Correct spelling of product names (LLMOps, not "LLMO").
  - Must be a **label**, never a copy of the user's question.
- **Two-pass retry** — if the title echoes the user or is too vague, a second
  synthesis pass asks for a topic label explicitly.
- Streamed back over SSE so the UI updates live.

---

## 7. Data Model (Slide: "Database Schema")

### 7.1 Entity Relationship (ASCII)

```
   users (1) ─── (N) conversations ─── (N) messages
      │                │
      │                ├── (N) conversation_summaries   (versioned, is_active)
      │                │
      │                └── (0..1) conversation_shares   (public token)
      │
      └── (N) conversation_shares.created_by
```

### 7.2 Table Summary

| Table | Key Columns | Notes |
|---|---|---|
| `users` | `id (UUID)`, `email` (unique), `hashed_password`, `display_name` | bcrypt-hashed passwords. |
| `conversations` | `id`, `user_id`, `title`, `is_archived`, `current_summary_id`, timestamps | FK-nullable `current_summary_id` to avoid circular cascade. |
| `messages` | `id`, `conversation_id`, `role`, `content`, `sequence_number`, `token_count`, `is_deleted`, `is_compressed`, `created_at` | Soft-delete via `is_deleted`. |
| `conversation_summaries` | `id`, `conversation_id`, `version`, `summary_text`, `start_sequence`, `end_sequence`, `is_active`, `metadata_json` | JSON blob holds `importance_score` + `key_entities`. |
| `conversation_shares` | `id`, `conversation_id` (unique), `created_by`, `token`, `created_at` | 192-bit URL-safe token. |

### 7.3 Cross-Database UUID Support

Custom `GUID` SQLAlchemy type (`app/models/guid.py`) so the same UUID column
works on **both Postgres (native UUID)** and **SQLite (CHAR(32))** — key for
fast local dev without giving up prod robustness.

---

## 8. API Surface (Slide: "REST Endpoints")

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create account → returns JWT. |
| POST | `/auth/login` | Email/password → JWT. |
| GET | `/auth/me` | Current user profile. |

### Conversations
| Method | Endpoint | Description |
|---|---|---|
| POST | `/conversations/` | Create new conversation. |
| GET | `/conversations/` | List user's active conversations (+ last-msg preview). |
| GET | `/conversations/{id}?page=N&page_size=M` | Paginated message history. |
| PATCH | `/conversations/{id}` | Rename / archive. |
| DELETE | `/conversations/{id}` | Cascade-delete convo + messages + summaries + shares + Qdrant points. |

### Messages
| Method | Endpoint | Description |
|---|---|---|
| POST | `/message/` | Send message → get full AI reply (JSON). |
| POST | `/message/stream` | Send message → stream reply via SSE. |
| PUT | `/message/{id}/edit` | Edit a message's content. |
| DELETE | `/message/{id}` | Soft-delete a message. |
| DELETE | `/message/incognito/session/{session_id}` | Forget volatile incognito session. |

### Search
| Method | Endpoint | Description |
|---|---|---|
| GET | `/search/keyword/{conversation_id}?query=` | SQL ILIKE in one convo. |
| GET | `/search/semantic?query=&top_k=&conversation_id=` | Vector similarity. |
| GET | `/search/global?q=&limit=` | **Fused** keyword + semantic across all user's convos. |

### Sharing
| Method | Endpoint | Description |
|---|---|---|
| POST | `/conversations/{id}/share` | Create or return existing share link. |
| GET | `/conversations/{id}/share` | Current share status. |
| DELETE | `/conversations/{id}/share` | Revoke share. |
| GET | `/shared/{token}` | **Public**, read-only snapshot. |

### Health
| GET | `/` | `{status: ok, service: ChatNest API, version: 2.0.0}` |

---

## 9. Request Lifecycle — Example (Slide: "What Happens on Send")

**User sends:** *"what was the DB port we picked last week?"*

1. **Frontend**: `useStreaming.sendStreaming()` POSTs to `/message/stream`.
2. **Middleware**: rate limit check → logging → CORS.
3. **Auth**: JWT validated via `get_current_user`.
4. **Router** (`messages.py`):
   - Verify user owns the conversation.
   - Insert `user_msg` row with `sequence_number = next`.
   - Schedule `store_embedding` (user msg) as background task.
   - **Build Smart Context**: recent messages + top-3 Qdrant hits
     (query = user content, scoped to `conversation_id`) + active summary.
5. **Behavior**: detect emotion + distress → compose system prompt → fetch
   generation config for selected mode.
6. **LLM stream**: `generate_response_stream(...)` yields chunks.
   - Each chunk is SSE-wrapped → frontend appends to streamingContent.
7. **On `done`**:
   - Insert `assistant_msg` row.
   - Emit `{done: true, message_id}` SSE event.
   - Embed assistant reply → Qdrant.
   - **Trigger compression check** — if ≥10 uncompressed messages, compress
     oldest 10 into a new `ConversationSummary`.
   - If first turn, generate auto-title and emit `{title_updated, title}`.
8. **Frontend**: finalizes message, refreshes sidebar.

---

## 10. Security & Reliability (Slide: "Prod Readiness")

| Concern | Mitigation |
|---|---|
| Cross-user data leaks | Every query filters by `user_id` from JWT. Global search computes allowed IDs server-side. |
| Password storage | bcrypt via `passlib`. |
| Token security | JWT HS256, configurable expiry (default 24h). |
| Rate limits | Custom middleware: 120 req / 60 s per IP, sliding window. |
| CORS | Explicit origin list + `allow_origin_regex` for localhost variants. |
| Unhandled exceptions | Global `@app.exception_handler(Exception)` returns JSON with CORS headers so the browser gets a real error, not "Network Error". |
| Gemini edge cases | `_safe_chunk_text` + `_finish_reason_from_chunk` — survives safety stops, MAX_TOKENS, recitation cuts. |
| DB schema drift | `DB_AUTO_CREATE_TABLES` env flag + idempotent `ConversationShare.__table__.create(checkfirst=True)`. |
| Circular FK (conversation ↔ current_summary) | `use_alter=True` on FK + explicit null-out before summary delete. |
| Vector store dimension mismatch | Auto-drop-and-recreate on collection open. |
| Incognito leakage | **Structural**: incognito branch takes no DB session and no `BackgroundTasks`. |
| Share token guessability | 192-bit URL-safe random (`secrets.token_urlsafe(24)`). |

---

## 11. Frontend UX Highlights (Slide: "The Interface")

- **Dark-first design** (Tailwind `bg-zinc-950`, `text-zinc-100`).
- **Sidebar**: conversation list, rename, archive, delete, "New Chat", mode
  picker, incognito toggle.
- **Command Palette (`⌘K` / `Ctrl+K`)**: fused keyword + semantic search
  across every conversation.
- **Streaming bubble**: live tokens render with Markdown + GFM + code blocks.
- **Share Dialog**: one-click share link, copy-to-clipboard, revoke.
- **PWA install**: installable app icon, "New chat" shortcut on long-press.
- **Safe-area-aware** mobile viewport (no iOS notch / home-indicator clipping).
- **Auth pages**: clean login/register, auto-redirects once JWT loads.

---

## 12. Folder Structure (Slide: "Codebase Map")

```
ChatNest/
├── app/                              ← FastAPI backend
│   ├── main.py                       ← app factory, middleware, routers, lifespan
│   ├── deps.py                       ← get_db, get_current_user
│   ├── core/
│   │   ├── config.py                 ← .env → typed constants
│   │   ├── database.py               ← SQLAlchemy engine + SessionLocal
│   │   └── security.py               ← bcrypt + JWT helpers
│   ├── middleware/
│   │   ├── logging_middleware.py
│   │   └── rate_limiter.py
│   ├── models/                       ← SQLAlchemy ORM
│   │   ├── user.py | conversation.py | message.py
│   │   ├── summary.py | share.py | guid.py (cross-DB UUID)
│   ├── schemas/                      ← Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py
│   │   ├── conversations.py
│   │   ├── messages.py               ← persistent + incognito, sync + streaming
│   │   ├── search.py                 ← keyword, semantic, global
│   │   └── shares.py                 ← owner + public routers
│   └── services/                     ← Pure business logic
│       ├── llm_service.py            ← Gemini: reply / stream / title / summary
│       ├── vector_service.py         ← Qdrant + SentenceTransformers singletons
│       ├── memory_service.py         ← importance-aware compression
│       ├── behavior_service.py       ← 8 modes + distress override
│       ├── emotion_service.py        ← rule-based emotion + distress
│       └── incognito_session.py      ← thread-safe in-RAM TTL store
├── frontend/                         ← Next.js 16 + React 19 + TS
│   └── src/
│       ├── app/  (login/, register/, shared/[token]/, page.tsx, layout.tsx)
│       ├── components/
│       │   ├── Sidebar.tsx | ChatWindow.tsx | ChatInput.tsx
│       │   ├── MessageBubble.tsx | StreamingBubble.tsx | MarkdownContent.tsx
│       │   ├── CommandPalette.tsx | ShareDialog.tsx | BrandLogo.tsx
│       ├── hooks/useStreaming.ts     ← persistent + incognito SSE
│       ├── services/ (api.ts, auth.ts, chat.ts)
│       ├── store/    (useAuthStore, useChatStore, useIncognitoStore,
│       │             useModeStore, useComposerStore)
│       └── types/index.ts
├── qdrant_storage/                   ← Qdrant on-disk files (vectors)
├── scripts/                          ← ad-hoc DB / migration scripts
├── requirements.txt
└── .env                              ← GEMINI_API_KEY, DATABASE_URL, …
```

---

## 13. Configuration (.env)

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres DSN | `sqlite:///./chatnest.db` |
| `USE_SQLITE` | Force SQLite | `false` |
| `DB_AUTO_CREATE_TABLES` | Auto `create_all` at startup | `false` |
| `GEMINI_API_KEY` | Google AI key | **required** |
| `GEMINI_MODEL` | Model id | `gemini-2.5-flash` |
| `GEMINI_MAX_OUTPUT_TOKENS` | Per-reply cap | `8192` |
| `JWT_SECRET_KEY` | HS256 secret | `CHANGE-ME-IN-PRODUCTION` |
| `JWT_EXPIRE_MINUTES` | Token lifetime | `1440` (24 h) |
| `QDRANT_PATH` | Qdrant on-disk dir | `./qdrant_storage` |
| `COMPRESSION_BATCH_SIZE` | Messages per summary | `10` |
| `CORS_ALLOW_ORIGINS` | Comma-separated origins | `localhost:3000` variants |

---

## 14. What Makes It Stand Out (Slide: "Why It's Different")

1. **Memory that actually compresses** — most demos drop old messages;
   ChatNest summarizes with importance scoring and entity extraction.
2. **Privacy as code** — Incognito Mode is a **separate execution path**, not
   a boolean in a function.
3. **Tone as a first-class feature** — 8 modes, each with its own prompt AND
   generation config, plus per-turn emotion + distress awareness.
4. **Search that's actually useful** — global palette fuses keyword and
   semantic signals with a "both" boost.
5. **Production-quality edge handling** — survives Gemini safety stops, token
   cutoffs, vector dimension drift, circular FKs, and CORS+500 pitfalls.
6. **Streaming done right** — auto-title piggybacks on the same SSE stream so
   the sidebar updates in place.
7. **Full-stack polish** — dark-first PWA UI, command palette, share links,
   markdown + GFM, mobile-safe viewport.

---

## 15. Suggested Slide Deck Outline (12–15 Slides)

1. **Title** — *ChatNest: An AI Chat Platform with Memory, Privacy & Personality*
2. **Problem** — 5 pain points of vanilla LLM chat (§2)
3. **Solution** — ChatNest in one line + capability grid (§3)
4. **Architecture** — system diagram (§5)
5. **Tech Stack** — two-column table (§4)
6. **Smart Context Engine** — the 3-source memory (§6.1)
7. **Importance-Aware Compression** — diagram + trigger flow (§6.2)
8. **Semantic & Global Search** — how keyword + semantic fuse (§6.3–6.4)
9. **Incognito Mode** — the "privacy as code" guarantees table (§6.5)
10. **Behavior Engine + Emotion** — modes table + distress override (§6.6–6.7)
11. **Streaming + Share Links** — SSE flow + token-based public sharing (§6.8–6.9)
12. **Data Model** — ER diagram + table summary (§7)
13. **API Surface** — endpoints by router (§8)
14. **Request Lifecycle** — numbered steps (§9)
15. **Security & Reliability** — mitigation table (§10)
16. **Frontend UX** — screenshot + highlights (§11) *(add real screenshots)*
17. **What's Next / Demo** — live send → streaming → search → share.

---

## 16. Taglines You Can Drop Into Slides

- *"Remembers what matters. Forgets on demand."*
- *"Chat, but with a memory you can search."*
- *"Eight personalities. One conversation.​"*
- *"Privacy isn't a setting — it's a separate code path."*
- *"From first token to shareable link in one stream."*

---

## 17. Key Numbers (for quick stats on a closing slide)

- **8** behavior modes with per-mode temperature + token budget.
- **7** emotion tags + distress override.
- **3** context sources blended per reply (summary + semantic + recent).
- **384-dim** cosine vectors in Qdrant.
- **192-bit** share-link tokens.
- **10** messages per compression batch.
- **30 min** idle TTL on incognito sessions (max 20 turns each).
- **120 req / 60 s** per-IP rate limit.
- **24 h** default JWT lifetime.
- **2.0.0** current API version.

---

*Document generated to feed any "Doc → PPT" pipeline. Every section above is
already scoped to a slide. For a finished deck, pair this with 2–3
screenshots of the UI (sidebar + chat, command palette, share dialog).*
