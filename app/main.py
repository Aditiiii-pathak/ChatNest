"""
ChatNest — Production-ready AI conversation & memory API.

Features:
    * Multi-conversation chat with Google Gemini
    * Smart Context Engine (recent + semantic + summary)
    * Importance-aware memory compression
    * Semantic search via Qdrant + all-MiniLM-L6-v2
    * JWT authentication
    * SSE streaming responses
    * Request logging & rate limiting
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import os

from app.core.config import DB_AUTO_CREATE_TABLES
from app.core.database import engine
from app.models import Base, ConversationShare
from app.middleware.logging_middleware import LoggingMiddleware
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.routers import auth, conversations, messages, search, shares

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-30s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)

# ── Application ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log = logging.getLogger(__name__)
    if DB_AUTO_CREATE_TABLES:
        Base.metadata.create_all(bind=engine)
        log.info(
            "DB_AUTO_CREATE_TABLES enabled — ran create_all (new tables only)."
        )
    else:
        log.info(
            "DB_AUTO_CREATE_TABLES disabled — using existing schema; no create_all."
        )

    # Always ensure the ``conversation_shares`` table exists — it was added
    # after the original deployment, isn't covered by the pre-existing
    # migrations, and is required for the Share feature to work. ``create``
    # with ``checkfirst=True`` is idempotent and touches only this one
    # table, so teams that manage the rest of their schema via Alembic
    # aren't surprised.
    try:
        ConversationShare.__table__.create(bind=engine, checkfirst=True)
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not ensure conversation_shares table: %s", exc)

    yield


app = FastAPI(
    title="ChatNest API",
    description=(
        "AI conversation & memory backend with semantic search, "
        "smart context engine, and importance-aware memory compression."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# ── Middleware (outermost first) ──────────────────────────────────────────────
app.add_middleware(
    RateLimiterMiddleware,
    max_requests=120,
    window_seconds=60,
)
app.add_middleware(LoggingMiddleware)

# NOTE: browsers reject any response that returns
#   Access-Control-Allow-Origin: *
#   Access-Control-Allow-Credentials: true
# at the same time. When we need to support credentialed requests we must
# send the explicit request Origin back. Using ``allow_origin_regex`` makes
# Starlette reflect the caller's Origin, which plays nicely with both the
# local Next.js dev server and any production origin listed below.
_cors_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
_cors_origins = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.31.223:3000",
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Global error handler ──────────────────────────────────────────────────────
# Starlette's built-in ServerErrorMiddleware sits OUTSIDE our CORSMiddleware,
# so any unhandled exception results in a 500 without CORS headers — the
# browser then reports a misleading "Network Error" to ``fetch`` / ``axios``.
# Registering an app-level exception handler forces the 500 response through
# the normal middleware chain (including CORS), giving the client a usable
# JSON error they can display.
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logging.getLogger("chatnest.errors").exception(
        "Unhandled exception on %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": exc.__class__.__name__,
        },
    )


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(search.router)
app.include_router(shares.owner_router)
app.include_router(shares.public_router)


@app.get("/", tags=["Health"])
def health_check():
    """API health-check endpoint."""
    return {
        "status": "ok",
        "service": "ChatNest API",
        "version": "2.0.0",
    }
