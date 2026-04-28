"""
Message endpoints — send, stream, edit, and delete.

Two pipelines share these endpoints:

**Persistent pipeline** (``incognito=False``, default)
    Uses the Smart Context Engine:
      1. Recent conversation messages
      2. Top-3 semantically similar past messages (vector search)
      3. Active compressed summary (long-term memory)
    Writes the user + assistant turns to SQL, stores embeddings in Qdrant,
    and triggers importance-aware memory compression.

**Incognito pipeline** (``incognito=True``)
    Strict privacy contract — for every incognito turn, we guarantee:
      * No SQL writes (no ``Message``, no ``Conversation`` updates).
      * No embeddings generated and the vector store is NEVER touched.
      * The memory/compression service is NEVER called.
      * No past conversation context is loaded into the prompt.
      * Only the current input + behavior prompt feed the LLM.
      * Emotion detection and the behavior engine still run — both are
        pure, stateless functions.
      * Optional volatile in-RAM history keyed by ``session_id``.

These two pipelines share the behavior engine and LLM service, but
diverge on every side-effecting call. The split is explicit and each
incognito branch early-returns before any persistent side-effect can
occur.
"""

import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.summary import ConversationSummary
from app.schemas.message import (
    MessageRequest,
    MessageEditRequest,
    MessageResponse,
    AssistantReply,
    IncognitoReply,
)
from app.services.behavior_service import (
    compose_system_prompt,
    get_generation_config,
)
from app.services.emotion_service import detect_distress, detect_emotion
from app.services import incognito_session
from app.services.llm_service import (
    generate_response,
    generate_response_stream,
    generate_title,
)
from app.services.vector_service import store_embedding, search_similar
from app.services.memory_service import compress_old_messages

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/message", tags=["Messages"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verify_conversation_access(
    db: Session,
    conversation_id: str,
    user: User,
) -> Conversation:
    """Return the conversation if it exists and belongs to *user*, else 404."""
    convo = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
        .first()
    )
    if not convo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return convo


def _build_smart_context(
    db: Session,
    conversation_id: str,
    user_content: str,
) -> dict:
    """Build the full LLM context: recent messages + semantic hits + summary.

    Returns:
        ``{messages, semantic_context, summary}`` ready for the LLM service.
    """
    recent = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation_id,
            Message.is_deleted == False,  # noqa: E712
        )
        .order_by(Message.sequence_number.asc())
        .all()
    )
    messages_for_llm = [{"role": m.role, "content": m.content} for m in recent]

    semantic_context = []
    try:
        similar = search_similar(
            query=user_content,
            conversation_id=conversation_id,
            top_k=3,
        )
        recent_ids = {str(m.id) for m in recent}
        for hit in similar:
            if hit["message_id"] not in recent_ids:
                semantic_context.append({
                    "role": hit["role"],
                    "content": hit["content"],
                })
    except Exception as exc:
        logger.debug("Semantic search skipped: %s", exc)

    summary_text = None
    active_summary = (
        db.query(ConversationSummary)
        .filter(
            ConversationSummary.conversation_id == conversation_id,
            ConversationSummary.is_active == True,  # noqa: E712
        )
        .first()
    )
    if active_summary:
        summary_text = active_summary.summary_text

    return {
        "messages": messages_for_llm,
        "semantic_context": semantic_context,
        "summary": summary_text,
    }


def _next_sequence(db: Session, conversation_id: str) -> int:
    """Return the next sequence number for a conversation."""
    last = (
        db.query(func.max(Message.sequence_number))
        .filter(Message.conversation_id == conversation_id)
        .scalar()
    )
    return (last or 0) + 1


def _auto_title_conversation(
    conversation_id: str, first_message: str
) -> str | None:
    """Generate a topic title for a freshly-started conversation.

    Opens its own session so it's safe to call after the request
    response has started (e.g. from within a streaming generator).

    Returns the new title when one was successfully persisted, otherwise
    ``None``. The caller may push this value to the client over SSE so
    the sidebar can update without a full refetch.
    """
    new_title = generate_title(first_message)
    if not new_title:
        return None
    session = SessionLocal()
    try:
        convo = (
            session.query(Conversation)
            .filter(Conversation.id == conversation_id)
            .first()
        )
        if not convo:
            return None
        # Only overwrite if still on the placeholder — the user may have
        # renamed the chat manually in the meantime.
        if (convo.title or "").strip().lower() in {"", "new conversation"}:
            convo.title = new_title
            session.commit()
            return new_title
        return None
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        logger.warning("Auto-title failed for %s: %s", conversation_id, exc)
        return None
    finally:
        session.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=None)
def send_message(
    request: MessageRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a user message and receive an AI reply.

    * **Persistent mode**: runs the Smart Context Engine, writes both
      turns to SQL, stores embeddings, and may trigger compression.
    * **Incognito mode**: no DB, no vector store, no memory service —
      just behavior + emotion + LLM.
    """
    content = request.content

    # ── Incognito fast path ───────────────────────────────────────────
    # Hard gate: we return from this branch before ANY persistence,
    # embedding, or memory-compression code can execute.
    if request.incognito:
        return _handle_incognito_send(request, content)

    # ── Persistent pipeline ───────────────────────────────────────────
    conversation_id = str(request.conversation_id)
    convo = _verify_conversation_access(db, conversation_id, current_user)
    next_seq = _next_sequence(db, conversation_id)

    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=content,
        sequence_number=next_seq,
        token_count=len(content.split()),
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    if next_seq == 1:
        background_tasks.add_task(
            _auto_title_conversation, conversation_id, content
        )

    background_tasks.add_task(
        store_embedding, str(user_msg.id), conversation_id, "user", content
    )

    ctx = _build_smart_context(db, conversation_id, content)

    # Behavior + emotion still apply in the persistent pipeline so the
    # model tone stays consistent across modes.
    emotion = detect_emotion(content)
    distressed = detect_distress(content)
    system_prompt = compose_system_prompt(
        mode=request.mode, emotion=emotion, incognito=False, distressed=distressed
    )
    gen_config = get_generation_config(request.mode)

    ai_content = generate_response(
        ctx["messages"],
        semantic_context=ctx["semantic_context"],
        summary=ctx["summary"],
        system_prompt=system_prompt,
        generation_config=gen_config,
    )

    assistant_msg = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=ai_content,
        sequence_number=next_seq + 1,
        token_count=len(ai_content.split()),
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    background_tasks.add_task(
        store_embedding, str(assistant_msg.id), conversation_id, "assistant", ai_content
    )
    background_tasks.add_task(compress_old_messages, db, conversation_id)

    return AssistantReply(
        user_message=MessageResponse.model_validate(user_msg),
        assistant_message=MessageResponse.model_validate(assistant_msg),
    )


def _handle_incognito_send(request: MessageRequest, content: str) -> IncognitoReply:
    """Incognito single-shot handler.

    Does NOT receive a ``Session`` dependency on purpose — this makes it
    structurally impossible for this branch to write to SQL. Also does
    not receive ``BackgroundTasks`` so no post-response persistence can
    be scheduled.
    """
    emotion = detect_emotion(content)
    distressed = detect_distress(content)
    system_prompt = compose_system_prompt(
        mode=request.mode, emotion=emotion, incognito=True, distressed=distressed
    )
    gen_config = get_generation_config(request.mode)

    # Volatile per-session turn list — RAM only, never persisted.
    prior_turns = incognito_session.get_turns(request.session_id) if request.session_id else []
    turns_for_llm = prior_turns + [{"role": "user", "content": content}]

    ai_content = generate_response(
        turns_for_llm,
        semantic_context=None,
        summary=None,
        system_prompt=system_prompt,
        generation_config=gen_config,
    )

    if request.session_id:
        incognito_session.append_turn(request.session_id, "user", content)
        incognito_session.append_turn(request.session_id, "assistant", ai_content)

    return IncognitoReply(
        mode=request.mode,
        emotion=emotion,
        content=ai_content,
        session_id=request.session_id,
        token_count=len(ai_content.split()),
    )


@router.post("/stream")
def stream_message(
    request: MessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a user message and stream the AI response via Server-Sent Events.

    Events:
        ``data: {"content": "chunk..."}``
        Persistent mode final event:
            ``data: {"done": true, "message_id": "<uuid>"}``
        Incognito mode final event:
            ``data: {"done": true, "incognito": true, "emotion": "...", "mode": "..."}``
    """
    content = request.content

    # ── Incognito fast path ───────────────────────────────────────────
    if request.incognito:
        return _stream_incognito(request, content)

    # ── Persistent pipeline ───────────────────────────────────────────
    conversation_id = str(request.conversation_id)
    convo = _verify_conversation_access(db, conversation_id, current_user)
    next_seq = _next_sequence(db, conversation_id)

    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=content,
        sequence_number=next_seq,
        token_count=len(content.split()),
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    is_first_turn = next_seq == 1

    ctx = _build_smart_context(db, conversation_id, content)

    emotion = detect_emotion(content)
    distressed = detect_distress(content)
    system_prompt = compose_system_prompt(
        mode=request.mode, emotion=emotion, incognito=False, distressed=distressed
    )
    gen_config = get_generation_config(request.mode)

    user_msg_id = str(user_msg.id)
    seq_for_assistant = next_seq + 1

    def event_stream():
        stream_db = SessionLocal()
        try:
            full_response = []
            for chunk in generate_response_stream(
                ctx["messages"],
                semantic_context=ctx["semantic_context"],
                summary=ctx["summary"],
                system_prompt=system_prompt,
                generation_config=gen_config,
            ):
                full_response.append(chunk)
                yield f"data: {json.dumps({'content': chunk})}\n\n"

            ai_content = "".join(full_response)

            assistant_msg = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=ai_content,
                sequence_number=seq_for_assistant,
                token_count=len(ai_content.split()),
            )
            stream_db.add(assistant_msg)
            stream_db.commit()
            stream_db.refresh(assistant_msg)

            yield f"data: {json.dumps({'done': True, 'message_id': str(assistant_msg.id)})}\n\n"

            try:
                store_embedding(user_msg_id, conversation_id, "user", content)
                store_embedding(
                    str(assistant_msg.id), conversation_id, "assistant", ai_content
                )
                compress_old_messages(stream_db, conversation_id)
                if is_first_turn:
                    new_title = _auto_title_conversation(conversation_id, content)
                    if new_title:
                        # Push the freshly generated title so the sidebar
                        # can update without refetching the whole list.
                        yield (
                            "data: "
                            + json.dumps({
                                "title_updated": True,
                                "conversation_id": conversation_id,
                                "title": new_title,
                            })
                            + "\n\n"
                        )
            except Exception as exc:
                logger.error("Post-stream tasks failed: %s", exc)
        finally:
            stream_db.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _stream_incognito(request: MessageRequest, content: str) -> StreamingResponse:
    """Incognito streaming handler.

    Mirrors the persistent streaming contract but:
      * Opens no database session.
      * Never calls ``store_embedding`` or ``compress_old_messages``.
      * Only keeps in-RAM turn history when the client opted in with a
        ``session_id``.
    """
    emotion = detect_emotion(content)
    distressed = detect_distress(content)
    mode = request.mode
    system_prompt = compose_system_prompt(
        mode=mode, emotion=emotion, incognito=True, distressed=distressed
    )
    gen_config = get_generation_config(mode)

    session_id = request.session_id
    prior_turns = incognito_session.get_turns(session_id) if session_id else []
    turns_for_llm = prior_turns + [{"role": "user", "content": content}]

    def event_stream():
        full_response: list[str] = []
        try:
            for chunk in generate_response_stream(
                turns_for_llm,
                semantic_context=None,
                summary=None,
                system_prompt=system_prompt,
                generation_config=gen_config,
            ):
                full_response.append(chunk)
                yield f"data: {json.dumps({'content': chunk})}\n\n"

            ai_content = "".join(full_response)

            # Volatile turn memory — no DB, no Qdrant, no summaries.
            if session_id:
                incognito_session.append_turn(session_id, "user", content)
                incognito_session.append_turn(session_id, "assistant", ai_content)

            yield (
                "data: "
                + json.dumps({
                    "done": True,
                    "incognito": True,
                    "emotion": emotion,
                    "mode": mode,
                    "session_id": session_id,
                })
                + "\n\n"
            )
        except Exception as exc:
            logger.error("Incognito stream failed: %s", exc)
            yield (
                "data: "
                + json.dumps({
                    "done": True,
                    "incognito": True,
                    "error": "stream_failed",
                })
                + "\n\n"
            )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/incognito/session/{session_id}")
def clear_incognito_session(session_id: str, current_user: User = Depends(get_current_user)):
    """Drop any volatile incognito turn memory for ``session_id``.

    This is best-effort: sessions also self-expire after 30 minutes of
    idleness, and the entire store is cleared on process restart.
    """
    incognito_session.clear(session_id)
    return {"ok": True, "session_id": session_id}


@router.put("/{message_id}/edit")
def edit_message(
    message_id: str,
    body: MessageEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit the content of a message."""
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    _verify_conversation_access(db, str(msg.conversation_id), current_user)

    msg.content = body.content
    db.commit()
    return {"message": "Message updated"}


@router.delete("/{message_id}")
def delete_message(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a message (sets is_deleted = True)."""
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    _verify_conversation_access(db, str(msg.conversation_id), current_user)

    msg.is_deleted = True
    db.commit()
    return {"message": "Message deleted"}
