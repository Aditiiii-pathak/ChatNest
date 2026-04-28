"""
Memory compression service — importance-aware summarization.

Compresses batches of old messages into rich summaries that preserve
user preferences, facts, decisions, and key entities.
"""

import json
import logging
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import COMPRESSION_BATCH_SIZE
from app.models.message import Message
from app.models.summary import ConversationSummary
from app.models.conversation import Conversation
from app.services.llm_service import generate_importance_summary

logger = logging.getLogger(__name__)


def compress_old_messages(
    db: Session,
    conversation_id,
) -> Optional[ConversationSummary]:
    """Compress the oldest uncompressed messages into an importance-aware summary.

    Triggers only when at least ``COMPRESSION_BATCH_SIZE`` uncompressed
    messages exist.  Preserves facts, preferences, and key entities via
    a structured LLM prompt.

    Args:
        db: Active SQLAlchemy session.
        conversation_id: UUID (string or UUID object) of the conversation.

    Returns:
        The new ``ConversationSummary`` if compression occurred, else ``None``.
    """
    try:
        messages = (
            db.query(Message)
            .filter(
                Message.conversation_id == str(conversation_id),
                Message.is_compressed == False,  # noqa: E712
                Message.is_deleted == False,       # noqa: E712
            )
            .order_by(Message.sequence_number.asc())
            .limit(COMPRESSION_BATCH_SIZE)
            .all()
        )

        if len(messages) < COMPRESSION_BATCH_SIZE:
            return None  # not enough to compress yet

        start_seq = messages[0].sequence_number
        end_seq = messages[-1].sequence_number

        conversation_text = "\n".join(f"{m.role}: {m.content}" for m in messages)

        # ── LLM: importance-aware summary ─────────────────────────────────
        result = generate_importance_summary(conversation_text)

        # ── Version management ────────────────────────────────────────────
        last_version = (
            db.query(ConversationSummary.version)
            .filter(ConversationSummary.conversation_id == str(conversation_id))
            .order_by(ConversationSummary.version.desc())
            .first()
        )
        next_version = (last_version[0] + 1) if last_version else 1

        # Deactivate all previous summaries
        db.query(ConversationSummary).filter(
            ConversationSummary.conversation_id == str(conversation_id),
            ConversationSummary.is_active == True,  # noqa: E712
        ).update({"is_active": False})

        # ── Create new summary ────────────────────────────────────────────
        metadata = json.dumps({
            "importance_score": result["importance_score"],
            "key_entities": result["key_entities"],
        })

        new_summary = ConversationSummary(
            id=uuid.uuid4(),
            conversation_id=str(conversation_id),
            version=next_version,
            summary_text=result["summary_text"],
            start_sequence=start_seq,
            end_sequence=end_seq,
            token_count=len(result["summary_text"].split()),
            is_active=True,
            metadata_json=metadata,
        )
        db.add(new_summary)

        # Mark messages as compressed
        for msg in messages:
            msg.is_compressed = True

        # Safely update conversation's current_summary_id
        conversation = (
            db.query(Conversation)
            .filter(Conversation.id == str(conversation_id))
            .first()
        )
        if conversation:
            conversation.current_summary_id = new_summary.id

        db.commit()

        logger.info(
            "Compressed messages %d–%d for conversation %s "
            "(v%d, importance=%d, entities=%s)",
            start_seq,
            end_seq,
            conversation_id,
            next_version,
            result["importance_score"],
            result["key_entities"],
        )
        return new_summary

    except Exception as exc:
        logger.error("Compression failed for %s: %s", conversation_id, repr(exc))
        db.rollback()
        return None
