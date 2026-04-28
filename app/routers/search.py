"""
Search endpoints — keyword (SQL) and semantic (vector).
"""

import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.search import (
    GlobalSearchHit,
    GlobalSearchResponse,
    KeywordSearchResult,
    SemanticSearchResult,
)
from app.services.vector_service import search_similar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["Search"])


def _make_snippet(content: str, query: str, window: int = 80) -> str:
    """Return a short context window around the first match of ``query``.

    Falls back to a prefix slice when the query doesn't appear literally,
    which happens when the semantic matcher surfaced a row with zero
    keyword overlap.
    """
    content = (content or "").strip()
    if not content:
        return ""
    lowered = content.lower()
    idx = lowered.find(query.lower()) if query else -1
    if idx == -1:
        return content[: window * 2].rstrip() + ("…" if len(content) > window * 2 else "")
    start = max(0, idx - window)
    end = min(len(content), idx + len(query) + window)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(content) else ""
    return f"{prefix}{content[start:end].strip()}{suffix}"


@router.get(
    "/keyword/{conversation_id}",
    response_model=List[KeywordSearchResult],
)
def keyword_search(
    conversation_id: str,
    query: str = Query(..., min_length=1, description="Text to search for"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SQL keyword search (case-insensitive LIKE) within a conversation.

    Returns messages whose content contains the *query* substring.
    """
    # Verify user owns the conversation
    convo = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not convo:
        return []

    results = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation_id,
            Message.content.ilike(f"%{query}%"),
            Message.is_deleted == False,  # noqa: E712
        )
        .order_by(Message.sequence_number.asc())
        .all()
    )
    return results


@router.get(
    "/semantic",
    response_model=List[SemanticSearchResult],
)
def semantic_search(
    query: str = Query(..., min_length=1, description="Semantic search query"),
    conversation_id: str = Query(
        None, description="Optional: limit search to one conversation"
    ),
    top_k: int = Query(5, ge=1, le=20, description="Number of results"),
    current_user: User = Depends(get_current_user),
):
    """Semantic similarity search across all messages using vector embeddings.

    Converts the *query* to an embedding and finds the most similar
    past messages in the vector store (cosine similarity).

    Optionally scoped to a single conversation via ``conversation_id``.
    """
    results = search_similar(
        query=query,
        conversation_id=conversation_id,
        top_k=top_k,
    )

    return [
        SemanticSearchResult(
            message_id=r["message_id"],
            conversation_id=r["conversation_id"],
            content=r["content"],
            role=r["role"],
            similarity_score=r["score"],
        )
        for r in results
    ]


@router.get(
    "/global",
    response_model=GlobalSearchResponse,
)
def global_search(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    limit: int = Query(25, ge=1, le=50, description="Max hits to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GlobalSearchResponse:
    """Search every conversation owned by the user in a single request.

    Fuses two strategies:
      1. **Keyword** — SQL ``ILIKE`` substring match, great for exact
         phrases, names, and code snippets the user remembers.
      2. **Semantic** — cosine similarity from Qdrant, great for
         "what did we say about X" where the exact words differ.

    Results from both strategies are merged on ``message_id`` and ordered
    by a blended score. Rows surfaced by both strategies get ``match_type
    = "both"`` and a score boost so they rise to the top.

    Only messages that belong to the calling user's conversations are
    ever returned — the caller is authenticated and we explicitly
    restrict every query to their ``conversation_id`` set.
    """
    query = q.strip()
    if not query:
        return GlobalSearchResponse(query=q, total=0, hits=[])

    # Build a fast lookup of user's conversations → title.
    user_convos: List[Conversation] = (
        db.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id,
            Conversation.is_archived == False,  # noqa: E712
        )
        .all()
    )
    convo_titles: Dict[str, str] = {
        str(c.id): (c.title or "Untitled")
        for c in user_convos
    }
    allowed_ids = set(convo_titles.keys())
    if not allowed_ids:
        return GlobalSearchResponse(query=q, total=0, hits=[])

    # ── Keyword branch ────────────────────────────────────────────────
    keyword_rows: List[Message] = (
        db.query(Message)
        .filter(
            Message.conversation_id.in_(allowed_ids),
            Message.is_deleted == False,  # noqa: E712
            Message.content.ilike(f"%{query}%"),
        )
        .order_by(Message.created_at.desc())
        .limit(limit * 2)
        .all()
    )

    hits: Dict[str, GlobalSearchHit] = {}
    for row in keyword_rows:
        mid = str(row.id)
        hits[mid] = GlobalSearchHit(
            conversation_id=str(row.conversation_id),
            conversation_title=convo_titles.get(str(row.conversation_id)),
            message_id=mid,
            role=row.role,
            content=row.content,
            snippet=_make_snippet(row.content, query),
            match_type="keyword",
            score=1.0,
            sequence_number=row.sequence_number,
        )

    # ── Semantic branch ───────────────────────────────────────────────
    try:
        semantic_results = search_similar(query=query, top_k=limit)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Semantic branch failed, keyword-only: %s", exc)
        semantic_results = []

    for r in semantic_results:
        conv_id = r.get("conversation_id", "")
        if conv_id not in allowed_ids:
            continue  # never leak cross-user results
        mid = r.get("message_id", "")
        if not mid:
            continue

        score = float(r.get("score", 0.0))
        content = r.get("content", "")

        if mid in hits:
            # Appears in both — merge and boost.
            existing = hits[mid]
            hits[mid] = existing.model_copy(
                update={
                    "match_type": "both",
                    "score": min(2.0, existing.score + score),
                }
            )
        else:
            hits[mid] = GlobalSearchHit(
                conversation_id=conv_id,
                conversation_title=convo_titles.get(conv_id),
                message_id=mid,
                role=r.get("role", "user"),
                content=content,
                snippet=_make_snippet(content, query),
                match_type="semantic",
                score=score,
                sequence_number=None,
            )

    # ── Rank and trim ─────────────────────────────────────────────────
    ordered = sorted(
        hits.values(),
        key=lambda h: (
            0 if h.match_type == "both" else 1 if h.match_type == "keyword" else 2,
            -h.score,
        ),
    )[:limit]

    return GlobalSearchResponse(
        query=q,
        total=len(ordered),
        hits=ordered,
    )
