"""
Application configuration — loaded from .env at startup.

Centralises every tuneable knob so that the rest of the codebase
never touches os.getenv directly.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Database ──────────────────────────────────────────────────────────────────
USE_SQLITE: bool = os.getenv("USE_SQLITE", "").strip().lower() in ("1", "true", "yes")

if USE_SQLITE:
    DATABASE_URL = "sqlite:///./chatnest.db"
else:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chatnest.db")

# When True, SQLAlchemy runs create_all() once at startup (creates missing tables only;
# it never ALTERs existing tables). Set False when Postgres schema is managed by you,
# pgAdmin, Alembic, or scripts/sync_conversations_schema.py.
DB_AUTO_CREATE_TABLES: bool = os.getenv(
    "DB_AUTO_CREATE_TABLES", ""
).strip().lower() in ("1", "true", "yes")

# ── Google Gemini ─────────────────────────────────────────────────────────────
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Chat completions: max tokens per reply (low values truncate long answers mid-sentence).
GEMINI_MAX_OUTPUT_TOKENS: int = int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "8192"))

# ── JWT Authentication ────────────────────────────────────────────────────────
JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "CHANGE-ME-IN-PRODUCTION")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

# ── Vector Store (Qdrant) ─────────────────────────────────────────────────────
QDRANT_PATH: str = os.getenv("QDRANT_PATH", "./qdrant_storage")
VECTOR_COLLECTION: str = "chatnest_memory"
VECTOR_DIM: int = 384  # all-MiniLM-L6-v2
EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

# ── Memory compression ───────────────────────────────────────────────────────
COMPRESSION_BATCH_SIZE: int = int(os.getenv("COMPRESSION_BATCH_SIZE", "10"))