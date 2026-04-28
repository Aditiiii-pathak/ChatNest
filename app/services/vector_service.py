"""
Vector embedding storage and semantic search.

Uses Qdrant (local persistent storage) + SentenceTransformers (all-MiniLM-L6-v2).
Singleton pattern for the encoder and client to avoid reloading on every call.
"""

import logging
from typing import Optional, List, Dict

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)
from sentence_transformers import SentenceTransformer

from app.core.config import EMBEDDING_MODEL, QDRANT_PATH, VECTOR_COLLECTION, VECTOR_DIM

logger = logging.getLogger(__name__)

# ── Singletons ────────────────────────────────────────────────────────────────
_client: Optional[QdrantClient] = None
_encoder: Optional[SentenceTransformer] = None


def _get_client() -> QdrantClient:
    """Return (or create) the Qdrant client singleton."""
    global _client
    if _client is None:
        _client = QdrantClient(path=QDRANT_PATH)
        _ensure_collection(_client)
    return _client


def _get_encoder() -> SentenceTransformer:
    """Return (or load) the SentenceTransformer encoder singleton."""
    global _encoder
    if _encoder is None:
        logger.info("Loading embedding model: %s …", EMBEDDING_MODEL)
        _encoder = SentenceTransformer(EMBEDDING_MODEL)
        logger.info("Embedding model loaded.")
    return _encoder


def _ensure_collection(client: QdrantClient) -> None:
    """Create the vector collection if missing, or recreate on dimension mismatch."""
    existing = [c.name for c in client.get_collections().collections]

    if VECTOR_COLLECTION in existing:
        info = client.get_collection(VECTOR_COLLECTION)
        existing_dim = info.config.params.vectors.size
        if existing_dim != VECTOR_DIM:
            logger.warning(
                "Dimension mismatch (%d → %d). Recreating collection.", existing_dim, VECTOR_DIM
            )
            client.delete_collection(VECTOR_COLLECTION)
        else:
            return  # already correct

    client.create_collection(
        collection_name=VECTOR_COLLECTION,
        vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
    )
    logger.info("Created Qdrant collection '%s' (%d-dim, cosine)", VECTOR_COLLECTION, VECTOR_DIM)


# ── Public API ────────────────────────────────────────────────────────────────

def store_embedding(
    message_id: str,
    conversation_id: str,
    role: str,
    content: str,
) -> None:
    """Encode *content* and upsert into Qdrant with metadata.

    Args:
        message_id: UUID string of the message.
        conversation_id: UUID string of the owning conversation.
        role: "user" or "assistant".
        content: Raw text to embed.
    """
    try:
        encoder = _get_encoder()
        client = _get_client()

        vector = encoder.encode(content).tolist()

        # Qdrant accepts UUID strings as point IDs
        point_id = message_id

        client.upsert(
            collection_name=VECTOR_COLLECTION,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "message_id": message_id,
                        "conversation_id": conversation_id,
                        "role": role,
                        "content": content,
                    },
                )
            ],
        )
        logger.debug("Stored embedding for message %s", message_id)
    except Exception as exc:
        logger.error("Failed to store embedding for %s: %s", message_id, exc)


def delete_by_conversation(conversation_id: str) -> int:
    """Purge every vector point tagged with ``conversation_id``.

    Used on conversation deletion so that orphaned embeddings don't keep
    surfacing in semantic searches.

    Returns the number of attempted deletes (best-effort — Qdrant doesn't
    always report a count). Errors are logged and swallowed so that a
    vector-store hiccup never blocks a SQL delete.
    """
    try:
        client = _get_client()
        client.delete(
            collection_name=VECTOR_COLLECTION,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="conversation_id",
                        match=MatchValue(value=conversation_id),
                    )
                ]
            ),
        )
        logger.info(
            "Purged embeddings for conversation %s from Qdrant", conversation_id
        )
        return 1
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Failed to purge embeddings for conversation %s: %s",
            conversation_id,
            exc,
        )
        return 0


def search_similar(
    query: str,
    conversation_id: Optional[str] = None,
    top_k: int = 5,
    score_threshold: float = 0.35,
) -> List[Dict]:
    """Return the *top_k* most semantically similar past messages.

    Args:
        query: The search text.
        conversation_id: Optional filter to limit results to one conversation.
        top_k: Maximum number of results.
        score_threshold: Minimum cosine similarity to include.

    Returns:
        List of dicts: ``{message_id, conversation_id, content, role, score}``
    """
    encoder = _get_encoder()
    client = _get_client()

    query_vector = encoder.encode(query).tolist()

    search_filter = None
    if conversation_id:
        search_filter = Filter(
            must=[FieldCondition(key="conversation_id", match=MatchValue(value=conversation_id))]
        )

    results = client.search(
        collection_name=VECTOR_COLLECTION,
        query_vector=query_vector,
        query_filter=search_filter,
        limit=top_k,
        score_threshold=score_threshold,
    )

    return [
        {
            "message_id": hit.payload.get("message_id", ""),
            "conversation_id": hit.payload.get("conversation_id", ""),
            "content": hit.payload.get("content", ""),
            "role": hit.payload.get("role", ""),
            "score": round(hit.score, 4),
        }
        for hit in results
    ]
