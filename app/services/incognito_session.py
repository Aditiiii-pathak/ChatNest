"""
Volatile, in-process session store for Incognito Mode.

The store keeps a short history of turns per ``session_id`` entirely in
RAM. It is:

* **Never persisted** — nothing is written to SQL, disk, or the vector
  store.
* **TTL-bounded** — entries expire after ``INCOGNITO_SESSION_TTL_SECONDS``
  of inactivity.
* **Size-bounded** — at most ``INCOGNITO_MAX_TURNS_PER_SESSION`` turns
  are kept per session; older turns are silently dropped.
* **Thread-safe** — guarded by a single module-level lock so concurrent
  requests from the same session don't race.
* **Opt-in** — only used when the client supplies a ``session_id``.

If the process restarts, all incognito history is gone. This is a
feature, not a bug.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List


# Tunables — kept here so the privacy posture is easy to review in one place.
INCOGNITO_SESSION_TTL_SECONDS = 30 * 60          # 30 minutes idle -> purge
INCOGNITO_MAX_TURNS_PER_SESSION = 20             # recent-turn window
INCOGNITO_MAX_SESSIONS = 10_000                  # hard cap, evicts oldest


@dataclass
class _Session:
    last_touched: float
    turns: List[Dict[str, str]] = field(default_factory=list)


_lock = threading.Lock()
_sessions: Dict[str, _Session] = {}


def _now() -> float:
    return time.monotonic()


def _purge_locked() -> None:
    """Drop expired sessions. Caller MUST hold ``_lock``."""
    cutoff = _now() - INCOGNITO_SESSION_TTL_SECONDS
    expired = [sid for sid, s in _sessions.items() if s.last_touched < cutoff]
    for sid in expired:
        _sessions.pop(sid, None)

    # Hard cap — evict oldest if we somehow exceed the ceiling.
    if len(_sessions) > INCOGNITO_MAX_SESSIONS:
        overflow = len(_sessions) - INCOGNITO_MAX_SESSIONS
        for sid, _ in sorted(_sessions.items(), key=lambda kv: kv[1].last_touched)[:overflow]:
            _sessions.pop(sid, None)


def get_turns(session_id: str) -> List[Dict[str, str]]:
    """Return a *copy* of the turns stored for ``session_id``.

    Returns an empty list if the session is unknown or expired. The copy
    shields callers from concurrent mutations in another request handler.
    """
    if not session_id:
        return []
    with _lock:
        _purge_locked()
        session = _sessions.get(session_id)
        if not session:
            return []
        session.last_touched = _now()
        return [dict(turn) for turn in session.turns]


def append_turn(session_id: str, role: str, content: str) -> None:
    """Append a turn to the session. No-op if ``session_id`` is empty.

    Enforces the per-session turn cap by dropping the oldest entries.
    """
    if not session_id or not content:
        return
    with _lock:
        _purge_locked()
        session = _sessions.get(session_id)
        if session is None:
            session = _Session(last_touched=_now())
            _sessions[session_id] = session

        session.turns.append({"role": role, "content": content})
        if len(session.turns) > INCOGNITO_MAX_TURNS_PER_SESSION:
            drop = len(session.turns) - INCOGNITO_MAX_TURNS_PER_SESSION
            del session.turns[:drop]
        session.last_touched = _now()


def clear(session_id: str) -> None:
    """Forget everything about a session immediately."""
    if not session_id:
        return
    with _lock:
        _sessions.pop(session_id, None)


def clear_all() -> None:
    """Wipe the entire in-memory store (for shutdown / tests)."""
    with _lock:
        _sessions.clear()
