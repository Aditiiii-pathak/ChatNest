"""
Conversation CRUD endpoints — all protected by JWT authentication.

Every conversation is scoped to the authenticated user.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.summary import ConversationSummary
from app.models.share import ConversationShare
from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationListItem,
    ConversationUpdate,
)
from app.schemas.message import MessageResponse, PaginatedMessages
from app.services import vector_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.post(
    "/",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    body: Optional[ConversationCreate] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new conversation for the authenticated user."""
    conversation = Conversation(
        user_id=current_user.id,
        title=body.title if body else "New Conversation",
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.get("/", response_model=List[ConversationListItem])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active conversations for the authenticated user, newest first."""
    conversations = (
        db.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id,
            Conversation.is_archived == False,  # noqa: E712
        )
        .order_by(Conversation.updated_at.desc())
        .all()
    )

    result: List[ConversationListItem] = []
    for convo in conversations:
        last_msg = (
            db.query(Message)
            .filter(
                Message.conversation_id == convo.id,
                Message.is_deleted == False,  # noqa: E712
            )
            .order_by(Message.sequence_number.desc())
            .first()
        )
        result.append(
            ConversationListItem(
                conversation_id=convo.id,
                title=convo.title,
                last_message_preview=last_msg.content[:80] if last_msg else None,
                updated_at=convo.updated_at,
            )
        )
    return result


@router.get("/{conversation_id}", response_model=PaginatedMessages)
def get_conversation(
    conversation_id: str,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get paginated messages in a conversation.

    Query params:
        page: Page number (default 1).
        page_size: Messages per page (default 50).
    """
    convo = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not convo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    base_query = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation_id,
            Message.is_deleted == False,  # noqa: E712
        )
        .order_by(Message.sequence_number.asc())
    )

    total = base_query.count()
    messages = base_query.offset((page - 1) * page_size).limit(page_size).all()

    return PaginatedMessages(
        messages=[MessageResponse.model_validate(m) for m in messages],
        total=total,
        page=page,
        page_size=page_size,
        has_more=total > page * page_size,
    )


@router.patch("/{conversation_id}", response_model=ConversationResponse)
def update_conversation(
    conversation_id: str,
    body: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partially update a conversation (title, is_archived)."""
    convo = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not convo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    if body.title is not None:
        convo.title = body.title
    if body.is_archived is not None:
        convo.is_archived = body.is_archived

    db.commit()
    db.refresh(convo)
    return convo


@router.delete("/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation owned by the authenticated user.

    Cascade order matters — the live Postgres schema may predate the
    ``ondelete="CASCADE"`` declarations in the ORM models, so we explicitly
    clean up dependants in a single transaction:

    1. Null out ``conversations.current_summary_id`` to break the circular
       FK with ``conversation_summaries``.
    2. Delete all ``ConversationSummary`` rows.
    3. Delete all ``Message`` rows.
    4. Delete the ``Conversation`` itself.
    5. Commit.
    6. Best-effort purge of Qdrant embeddings (in background).
    """
    convo = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not convo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    try:
        # 1. Break the circular FK (conversations → summaries) before
        #    deleting any summary rows.
        if convo.current_summary_id is not None:
            convo.current_summary_id = None
            db.flush()

        # 2. Drop dependants explicitly — don't rely on DB-level cascade
        #    because older deployments may not have it.
        db.query(ConversationShare).filter(
            ConversationShare.conversation_id == conversation_id
        ).delete(synchronize_session=False)

        db.query(ConversationSummary).filter(
            ConversationSummary.conversation_id == conversation_id
        ).delete(synchronize_session=False)

        db.query(Message).filter(
            Message.conversation_id == conversation_id
        ).delete(synchronize_session=False)

        # 3. Delete the conversation itself.
        db.delete(convo)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.exception("Failed to delete conversation %s", conversation_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not delete conversation: {exc.__class__.__name__}",
        )

    # 4. Fire-and-forget vector-store cleanup after the SQL commit succeeded.
    background_tasks.add_task(
        vector_service.delete_by_conversation, conversation_id
    )

    return {"message": "Conversation deleted"}
