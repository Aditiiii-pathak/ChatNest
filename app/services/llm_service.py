"""
Google Gemini LLM integration.

Provides:
- generate_response()       — single-shot AI reply with smart context
- generate_response_stream() — streaming AI reply via generator
- generate_title()           — short conversation title from first message
- generate_importance_summary() — importance-aware memory compression
"""

import json
import logging
from typing import Generator, List, Dict, Optional, Tuple

import google.generativeai as genai

from app.core.config import GEMINI_API_KEY, GEMINI_MAX_OUTPUT_TOKENS, GEMINI_MODEL

logger = logging.getLogger(__name__)

genai.configure(api_key=GEMINI_API_KEY)
_model = genai.GenerativeModel(GEMINI_MODEL)

BASE_SYSTEM_PROMPT = (
    "You are a clear and structured AI assistant.\n"
    "Respond in a clean, easy-to-read format.\n"
    "Use short paragraphs. Avoid overly academic tone.\n"
    "Explain complex topics simply.\n"
    "Use bullet points when helpful.\n"
    "Maintain spacing between sections.\n"
    "Be concise but informative."
)


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    messages: List[Dict],
    semantic_context: Optional[List[Dict]] = None,
    summary: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> str:
    """Build a single prompt string merging recent messages, semantic hits, and summary.

    Context priority:
      1. Active conversation summary (compressed long-term memory)
      2. Semantic search hits (relevant past snippets)
      3. Recent messages (current conversation flow)

    Args:
        messages: Turn list for the current conversation.
        semantic_context: Top-k retrieved past snippets.
        summary: Active compressed long-term summary.
        system_prompt: Behavior/system prompt. When ``None``, the default
            ChatNest tone is used. Callers in Incognito Mode pass a
            privacy-aware prompt so the model knows not to reference
            history.
    """
    header = system_prompt if system_prompt else BASE_SYSTEM_PROMPT
    parts: List[str] = [header, ""]

    if summary:
        parts.append("=== Previous Conversation Summary ===")
        parts.append(summary)
        parts.append("")

    if semantic_context:
        parts.append("=== Relevant Past Context ===")
        for ctx in semantic_context:
            parts.append(f"[{ctx['role']}]: {ctx['content']}")
        parts.append("")

    parts.append("=== Current Conversation ===")
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            continue
        label = "User" if role == "user" else "Assistant"
        parts.append(f"{label}: {content}")

    return "\n".join(parts)


# ── Public API ────────────────────────────────────────────────────────────────

_DEFAULT_GENERATION_CONFIG: Dict[str, float | int] = {
    "temperature": 0.7,
    "max_output_tokens": GEMINI_MAX_OUTPUT_TOKENS,
}


def _resolve_generation_config(
    override: Optional[Dict[str, float | int]],
) -> Dict[str, float | int]:
    """Merge the caller's override with sane defaults.

    Behavior modes only need to specify the keys they care about
    (typically ``temperature`` and ``max_output_tokens``); everything
    else falls back to the base config.

    ``thinking_budget`` is a ChatNest-level concept used to document
    which modes want to skip Gemini 2.5's internal reasoning. The
    currently installed ``google.generativeai`` 0.8.x SDK does NOT
    expose that knob — it rejects unknown ``GenerationConfig`` fields.
    We therefore pop it out here so it never reaches the SDK. Once we
    migrate to the new ``google.genai`` package, this is the single
    place that has to translate it into a real ``ThinkingConfig``.
    """
    cfg = dict(_DEFAULT_GENERATION_CONFIG)
    if override:
        cfg.update(override)

    cfg.pop("thinking_budget", None)  # not supported by google.generativeai 0.8.x
    return cfg


def _safe_chunk_text(chunk) -> Optional[str]:
    """Best-effort text extraction from a Gemini streaming chunk.

    Gemini can emit metadata-only chunks (e.g. the final finish_reason
    marker, or a chunk that was held back by a safety rating). Reading
    ``chunk.text`` on those can raise ``ValueError`` / ``IndexError``,
    which — if uncaught — kills the whole streaming generator and gives
    the user a half-written sentence.

    This helper tries ``chunk.text`` first, then falls back to walking
    ``chunk.candidates[*].content.parts[*].text`` before giving up.
    """
    try:
        text = chunk.text
        if text:
            return text
    except Exception:
        pass

    try:
        candidates = getattr(chunk, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) if content else None
            if not parts:
                continue
            collected: List[str] = []
            for part in parts:
                part_text = getattr(part, "text", None)
                if part_text:
                    collected.append(part_text)
            if collected:
                return "".join(collected)
    except Exception:
        pass

    return None


def _finish_reason_from_chunk(chunk) -> Optional[str]:
    """Extract ``finish_reason`` from a chunk, if present."""
    try:
        candidates = getattr(chunk, "candidates", None) or []
        if not candidates:
            return None
        fr = getattr(candidates[0], "finish_reason", None)
        if fr is None:
            return None
        # Some SDK versions return an enum with `.name`, others a plain int/str.
        return getattr(fr, "name", str(fr))
    except Exception:
        return None


_TRUNCATION_HINT = {
    "MAX_TOKENS": "\n\n_(reply reached the length limit — ask me to continue if you want more.)_",
    "SAFETY": "\n\n_(I had to stop early here to stay within safety guidelines.)_",
    "RECITATION": "\n\n_(I had to stop early here to avoid reciting copyrighted content.)_",
}


def generate_response(
    messages: List[Dict],
    semantic_context: Optional[List[Dict]] = None,
    summary: Optional[str] = None,
    system_prompt: Optional[str] = None,
    generation_config: Optional[Dict[str, float | int]] = None,
) -> str:
    """Generate a single AI response with full smart context.

    Args:
        messages: Recent conversation messages ``[{role, content}]``.
        semantic_context: Top-k similar past messages from vector search.
        summary: Active compressed summary of earlier conversation.
        system_prompt: Optional behavior prompt (from the behavior engine).
            If omitted, the base ChatNest tone is used.
        generation_config: Optional per-mode overrides for Gemini's
            generation config (e.g. ``temperature``, ``max_output_tokens``).
            Falls back to ``_DEFAULT_GENERATION_CONFIG`` when omitted.

    Returns:
        The assistant's reply as a plain string.
    """
    try:
        prompt = _build_prompt(messages, semantic_context, summary, system_prompt)
        response = _model.generate_content(
            prompt,
            generation_config=_resolve_generation_config(generation_config),
        )

        content: Optional[str] = None
        try:
            content = response.text
        except Exception:
            content = _safe_chunk_text(response)

        finish_reason = _finish_reason_from_chunk(response)

        if not content:
            if finish_reason and finish_reason in _TRUNCATION_HINT:
                logger.warning(
                    "Gemini returned no text (finish_reason=%s)", finish_reason
                )
                return (
                    "I couldn't produce a reply for that just now. "
                    "Mind rephrasing or asking again?"
                )
            raise ValueError("Empty response from Gemini")

        if finish_reason and finish_reason not in {"STOP", "FINISH_REASON_UNSPECIFIED"}:
            logger.warning(
                "Gemini response finished with reason=%s — returning partial text",
                finish_reason,
            )
            hint = _TRUNCATION_HINT.get(finish_reason)
            if hint:
                return content.strip() + hint

        return content.strip()
    except Exception as exc:
        logger.error("Gemini response error: %s", repr(exc))
        return "I'm temporarily unavailable. Please try again."


def generate_response_stream(
    messages: List[Dict],
    semantic_context: Optional[List[Dict]] = None,
    summary: Optional[str] = None,
    system_prompt: Optional[str] = None,
    generation_config: Optional[Dict[str, float | int]] = None,
) -> Generator[str, None, None]:
    """Stream AI response chunks for Server-Sent Events.

    Args:
        messages: Recent conversation messages ``[{role, content}]``.
        semantic_context: Top-k similar past messages from vector search.
            Pass ``None`` in Incognito Mode.
        summary: Active compressed summary. Pass ``None`` in Incognito Mode.
        system_prompt: Optional behavior prompt from the behavior engine.
        generation_config: Optional per-mode overrides — see
            :func:`generate_response` for details.

    Yields:
        Text chunks as they arrive from Gemini.
    """
    try:
        prompt = _build_prompt(messages, semantic_context, summary, system_prompt)
        response = _model.generate_content(
            prompt,
            generation_config=_resolve_generation_config(generation_config),
            stream=True,
        )

        last_finish_reason: Optional[str] = None
        emitted_any_text = False

        for chunk in response:
            text = _safe_chunk_text(chunk)
            if text:
                emitted_any_text = True
                yield text

            fr = _finish_reason_from_chunk(chunk)
            if fr:
                last_finish_reason = fr

        if last_finish_reason and last_finish_reason not in {"STOP", "FINISH_REASON_UNSPECIFIED"}:
            logger.warning(
                "Gemini stream ended early: finish_reason=%s emitted_text=%s",
                last_finish_reason,
                emitted_any_text,
            )
            hint = _TRUNCATION_HINT.get(last_finish_reason)
            if hint:
                yield hint
            elif not emitted_any_text:
                yield (
                    "I couldn't produce a reply for that just now. "
                    "Mind rephrasing or asking again?"
                )
    except Exception as exc:
        logger.error("Gemini streaming error: %s", repr(exc))
        yield "I'm temporarily unavailable. Please try again."


def _fallback_title_from_message(message: str) -> str:
    """Last resort: short clip from the message (only if LLM calls fail)."""
    words = message.strip().split()
    if not words:
        return "New conversation"
    chunk = words[:10]
    title = " ".join(chunk)
    if len(title) > 58:
        cut = title[:55].rsplit(" ", 1)[0]
        title = cut + "…" if cut else title[:58] + "…"
    return title[0].upper() + title[1:] if len(title) > 1 else title.upper()


def _clean_title_line(raw: Optional[str]) -> str:
    if not raw:
        return ""
    title = raw.strip().split("\n")[0].strip()
    if (title.startswith('"') and title.endswith('"')) or (
        title.startswith("'") and title.endswith("'")
    ):
        title = title[1:-1].strip()
    return title


def _title_echoes_user_message(title: str, user_message: str) -> bool:
    """True when the title is basically the user's question copied, not a label."""
    tw = title.lower().split()
    uw = user_message.lower().split()
    if len(tw) < 3 or len(uw) < 3:
        return False
    n = min(len(tw), len(uw), 6)
    return tw[:n] == uw[:n]


def _title_too_vague(title: str, user_message: str) -> bool:
    """True when the model returned something too short vs. the user's ask."""
    tw = title.strip().split()
    uw = user_message.split()
    if len(tw) >= 4:
        return False
    # Very short user prompts — allow shorter titles
    if len(uw) <= 3:
        return False
    # One-word titles for a sentence-length prompt are often wrong ("LLMO", "Python", …)
    if len(tw) == 1 and len(uw) >= 4:
        return True
    # Two words only when the user wrote a long message — usually need more context
    if len(tw) == 2 and len(uw) >= 10:
        return True
    return False


def _llm_primary_title(user_message: str) -> Tuple[str, Optional[Exception]]:
    prompt = (
        "You label chat conversations. Read the user's FIRST message and write ONE title.\n\n"
        "Rules:\n"
        "- Use 4 to 9 words that capture the TOPIC, GOAL, and key technologies.\n"
        "- Spell product and domain names correctly (e.g. LLMOps, DevOps, Kubernetes) — "
        "never invent broken abbreviations like \"LLMO\" for LLMOps.\n"
        "- The title should read like a short folder name, not the user's question repeated.\n"
        "- Do NOT output a single word when the user wrote a sentence.\n"
        "- No quotation marks, emoji, or trailing punctuation. One line only.\n\n"
        f"User message:\n{user_message}"
    )
    try:
        response = _model.generate_content(
            prompt,
            generation_config={"temperature": 0.35, "max_output_tokens": 64},
        )
        title = _clean_title_line(response.text)
        if not title or len(title) > 100:
            return "", ValueError("empty or long title")
        return title, None
    except Exception as exc:
        return "", exc


def _llm_synthetic_topic_title(user_message: str) -> Tuple[str, Optional[Exception]]:
    """Second pass: topic label only — must not copy the user's phrasing."""
    prompt = (
        "Write a SHORT chat thread TITLE (5 to 8 words) for the topic below.\n\n"
        "Critical rules:\n"
        "- This must be a LABEL summarizing the subject — NOT a copy of the user's question.\n"
        "- Do NOT start with \"What is\", \"How do\", \"Need a\", \"Can you\", or mirror their sentence.\n"
        "- Good: \"LLMOps vs MLOps plans and differences\", \"Django REST API with JWT\"\n"
        "- Bad: \"What is the plan for LLMOps\" (echoes the user)\n"
        "- Use correct spellings: LLMOps, MLOps, Kubernetes.\n"
        "- One line, plain text, no quotes.\n\n"
        f"User message:\n{user_message.strip()}"
    )
    try:
        response = _model.generate_content(
            prompt,
            generation_config={"temperature": 0.25, "max_output_tokens": 64},
        )
        title = _clean_title_line(response.text)
        if not title or len(title) > 100:
            return "", ValueError("empty or long title")
        return title, None
    except Exception as exc:
        return "", exc


def generate_title(first_user_message: str) -> str:
    """Generate a topic-aware title — prefers a synthesized label, not the raw prompt."""
    raw = (first_user_message or "").strip()
    if not raw:
        return "New conversation"

    primary, err_primary = _llm_primary_title(raw)
    primary = primary.strip()

    if (
        primary
        and not _title_too_vague(primary, raw)
        and not _title_echoes_user_message(primary, raw)
    ):
        return primary

    synthetic, err_syn = _llm_synthetic_topic_title(raw)
    synthetic = synthetic.strip()

    if synthetic and not _title_echoes_user_message(synthetic, raw):
        return synthetic

    if primary and not _title_echoes_user_message(primary, raw):
        return primary

    logger.debug(
        "Title generation used clip fallback (primary=%s synthetic=%s)",
        repr(err_primary),
        repr(err_syn),
    )
    return _fallback_title_from_message(raw)


def generate_importance_summary(conversation_text: str) -> dict:
    """Generate an importance-aware summary with structured metadata.

    The LLM extracts key facts, preferences, and decisions, and assigns
    an importance score (1-10) plus a list of key entities.

    Returns:
        ``{summary_text: str, importance_score: int, key_entities: list[str]}``
    """
    try:
        prompt = (
            "You are a memory compression engine. Summarize this conversation.\n\n"
            "RULES:\n"
            "1. Preserve ALL: user preferences, stated facts, decisions, names, "
            "locations, technical details, and action items.\n"
            "2. Remove: filler, greetings, and repetitive content.\n"
            "3. After the summary, output a JSON block with:\n"
            '   {"importance_score": <1-10>, "key_entities": ["entity1", ...]}\n\n'
            "CONVERSATION:\n"
            f"{conversation_text}\n\n"
            "OUTPUT FORMAT:\n"
            "SUMMARY:\n<your summary>\n\n"
            "METADATA:\n<json block>"
        )
        response = _model.generate_content(
            prompt,
            generation_config={"temperature": 0.2, "max_output_tokens": 600},
        )
        text = (response.text or "").strip()

        # Parse summary and metadata sections
        summary_text = text
        metadata: dict = {"importance_score": 5, "key_entities": []}

        if "METADATA:" in text:
            parts = text.split("METADATA:", 1)
            summary_text = parts[0].replace("SUMMARY:", "").strip()
            try:
                json_str = parts[1].strip()
                # Strip markdown code fences if present
                if "```" in json_str:
                    json_str = json_str.split("```")[1]
                    if json_str.startswith("json"):
                        json_str = json_str[4:]
                metadata = json.loads(json_str.strip())
            except (json.JSONDecodeError, IndexError):
                pass

        return {
            "summary_text": summary_text,
            "importance_score": metadata.get("importance_score", 5),
            "key_entities": metadata.get("key_entities", []),
        }
    except Exception as exc:
        logger.error("Summary generation error: %s", repr(exc))
        return {
            "summary_text": conversation_text[:500],
            "importance_score": 5,
            "key_entities": [],
        }
