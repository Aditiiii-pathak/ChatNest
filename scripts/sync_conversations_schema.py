"""
One-time helper: add missing columns on PostgreSQL when tables were created by an
older schema. `create_all()` does not ALTER existing tables.

Patches:
  - `conversations`: user_id, is_archived, current_summary_id (as needed)
  - `conversation_summaries`: metadata_json (as needed)

Usage (from repo root, venv active):
    python scripts/sync_conversations_schema.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, inspect, text  # noqa: E402

from app.core.config import DATABASE_URL, USE_SQLITE  # noqa: E402


def main() -> int:
    if USE_SQLITE or not DATABASE_URL or "postgresql" not in DATABASE_URL.lower():
        print("Nothing to do: use PostgreSQL with DATABASE_URL set (not SQLite).")
        return 0

    engine = create_engine(DATABASE_URL)
    insp = inspect(engine)

    with engine.begin() as conn:
        if insp.has_table("conversations"):
            cols = {c["name"] for c in insp.get_columns("conversations")}
            fks = {fk["name"] for fk in insp.get_foreign_keys("conversations")}
        else:
            cols = set()
            fks = set()
            print("Table `conversations` not found — skipping.")

        if "user_id" not in cols and insp.has_table("conversations"):
            conn.execute(text("ALTER TABLE conversations ADD COLUMN user_id UUID"))
            conn.execute(
                text(
                    """
                    UPDATE conversations AS c
                    SET user_id = u.id
                    FROM (SELECT id FROM users ORDER BY created_at NULLS LAST LIMIT 1) AS u
                    WHERE c.user_id IS NULL
                    """
                )
            )
            conn.execute(text("ALTER TABLE conversations ALTER COLUMN user_id SET NOT NULL"))
            if "fk_conversations_user_id_users" not in fks and "conversations_user_id_fkey" not in fks:
                try:
                    conn.execute(
                        text(
                            """
                            ALTER TABLE conversations
                            ADD CONSTRAINT fk_conversations_user_id_users
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                            """
                        )
                    )
                except Exception as exc:
                    print("Could not add user_id foreign key (may already exist):", exc)
            print("Added column: user_id")

        if insp.has_table("conversations") and "is_archived" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE conversations ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false"
                )
            )
            print("Added column: is_archived")

        if insp.has_table("conversations") and "current_summary_id" not in cols:
            conn.execute(text("ALTER TABLE conversations ADD COLUMN current_summary_id UUID"))
            try:
                conn.execute(
                    text(
                        """
                        ALTER TABLE conversations
                        ADD CONSTRAINT fk_conv_current_summary
                        FOREIGN KEY (current_summary_id)
                        REFERENCES conversation_summaries(id)
                        """
                    )
                )
            except Exception as exc:
                print("Optional FK fk_conv_current_summary skipped:", exc)
            print("Added column: current_summary_id")

        if insp.has_table("conversation_summaries"):
            sum_cols = {c["name"] for c in insp.get_columns("conversation_summaries")}
            if "metadata_json" not in sum_cols:
                conn.execute(
                    text("ALTER TABLE conversation_summaries ADD COLUMN metadata_json TEXT")
                )
                print("Added column: conversation_summaries.metadata_json")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
