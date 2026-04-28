"""Search result schemas."""

from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SemanticSearchResult(BaseModel):
    """One result from GET /search/semantic."""
    message_id: str
    conversation_id: str
    content: str
    role: str
    similarity_score: float


class KeywordSearchResult(BaseModel):
    """One result from GET /search/keyword/{conversation_id}."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    role: str
    content: str
    sequence_number: int


class GlobalSearchHit(BaseModel):
    """One hit in the cross-conversation search result set.

    ``match_type`` reflects how the row was found:
    * ``"keyword"`` — substring match on the raw SQL message content.
    * ``"semantic"`` — vector similarity match from Qdrant.
    * ``"both"`` — surfaced by both strategies (boosted in ordering).
    """

    conversation_id: str
    conversation_title: Optional[str]
    message_id: str
    role: str
    content: str
    snippet: str
    match_type: Literal["keyword", "semantic", "both"]
    score: float
    sequence_number: Optional[int] = None


class GlobalSearchResponse(BaseModel):
    """Envelope for GET /search/global."""

    query: str
    total: int
    hits: List[GlobalSearchHit]
