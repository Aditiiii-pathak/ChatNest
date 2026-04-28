"""
Lightweight emotion detection — stateless, offline, zero side-effects.

Design notes
------------
The detector is intentionally rule-based:

* It must run in the Incognito pipeline, which forbids any external I/O
  that could leak user text (no vector DB, no remote embedding service).
* It must be cheap enough to run inline on every request, including the
  first streaming token.
* It must never raise — emotion is a *hint*, not a gate.

The classifier inspects the raw user text for lexical cues, emoji, and
punctuation pressure. The output is one of a small fixed tag set:

    neutral | happy | sad | angry | anxious | curious | frustrated

If the text is empty, garbled, or matches no cues, ``"neutral"`` is
returned. This is used only as a prompt hint for the behavior engine;
nothing is stored.
"""

from __future__ import annotations

import re
from typing import Dict, Tuple


_EMOTION_LEXICON: Dict[str, Tuple[str, ...]] = {
    "happy": (
        "happy", "glad", "great", "awesome", "amazing", "love", "loved",
        "excited", "yay", "thanks", "thank you", "appreciate", "wonderful",
        "fantastic", "delighted", ":)", ":-)", ":d", "😀", "😁", "😊", "🥰", "❤",
    ),
    "sad": (
        "sad", "down", "depressed", "depressing", "depression", "depressive",
        "hopeless", "worthless", "miserable", "numb", "empty", "drained",
        "exhausted", "burnt out", "burnout", "tired of", "giving up",
        "hurt", "hurting", "lonely", "alone", "miss", "missing", "cry",
        "crying", "tears", "broken", "heartbroken", "grief", "grieving",
        "lost", "unloved", ":(", ":-(", "😢", "😭", "💔",
    ),
    "angry": (
        "angry", "mad", "furious", "hate", "rage", "pissed", "annoyed",
        "outrageous", "unacceptable", "😠", "😡", "🤬",
    ),
    "anxious": (
        "anxious", "nervous", "worried", "worry", "scared", "afraid",
        "panic", "panicking", "stressed", "stress", "overwhelmed",
        "can't sleep", "cant sleep", "😟", "😰", "😨",
    ),
    "frustrated": (
        "frustrated", "frustrating", "stuck", "broken", "not working",
        "doesn't work", "doesnt work", "keeps failing", "ugh", "why won't",
        "why doesnt", "why doesn't", "😤", "🙄",
    ),
    "curious": (
        "why", "how", "what", "who", "when", "where", "explain", "tell me",
        "curious", "wondering", "interesting",
    ),
}

# Ordered from most specific to most generic so that "curious" (which is
# a big catch-all for question words) is only chosen when nothing stronger
# matches.
_EMOTION_PRIORITY = ("angry", "frustrated", "sad", "anxious", "happy", "curious")

_WORD_SPLIT = re.compile(r"[^\w']+", re.UNICODE)


# High-severity cues. If ANY of these appear, we treat the turn as
# "distressed" — a signal the behavior engine uses to soften tone-
# enforcement rules (e.g. buddy's "keep it short") in favor of real
# empathy. These are substring matches (lowercased) so multi-word
# phrases match naturally.
_DISTRESS_CUES: Tuple[str, ...] = (
    "depression", "depressed", "depressive",
    "hopeless", "worthless", "miserable",
    "numb", "empty inside", "burnt out", "burnout",
    "tired of life", "tired of everything",
    "can't go on", "cant go on", "no reason to",
    "giving up", "give up on life",
    "want to die", "wanna die", "kill myself",
    "suicide", "suicidal", "end it all", "end my life",
    "self-harm", "self harm", "cutting myself", "hurt myself",
    "no one cares", "nobody cares", "nobody loves me",
    "can't cope", "cant cope", "i can't anymore", "i cant anymore",
    "breaking down", "breakdown", "falling apart",
    "having depression", "severe anxiety", "panic attack",
)


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def _score_emotion(text: str, keywords: Tuple[str, ...]) -> int:
    """Return a rough match count for a keyword set against the text."""
    if not text:
        return 0
    score = 0
    tokens = set(filter(None, _WORD_SPLIT.split(text)))
    for kw in keywords:
        if " " in kw or len(kw) <= 2:
            # Multi-word phrases and emoji fall back to substring match.
            if kw in text:
                score += 1
        elif kw in tokens:
            score += 1
    return score


def detect_emotion(text: str) -> str:
    """Return a single emotion tag for ``text``.

    This function is pure: it never raises, never writes, and never makes
    network calls. Suitable for the Incognito pipeline.
    """
    try:
        normalized = _normalize(text)
        if not normalized:
            return "neutral"

        scores = {
            label: _score_emotion(normalized, _EMOTION_LEXICON[label])
            for label in _EMOTION_PRIORITY
        }

        # Emphasize pressure — ALL CAPS or many '!' often intensify an emotion.
        exclaim = text.count("!")
        caps_ratio = (
            sum(1 for c in text if c.isupper()) / max(sum(1 for c in text if c.isalpha()), 1)
        )
        if exclaim >= 2 or caps_ratio > 0.6:
            for intensifiable in ("angry", "frustrated", "happy"):
                if scores[intensifiable] > 0:
                    scores[intensifiable] += 1

        best_label = "neutral"
        best_score = 0
        for label in _EMOTION_PRIORITY:  # priority order breaks ties
            if scores[label] > best_score:
                best_label = label
                best_score = scores[label]

        return best_label if best_score > 0 else "neutral"
    except Exception:
        # Emotion is advisory; any failure degrades gracefully.
        return "neutral"


def detect_distress(text: str) -> bool:
    """Return ``True`` if the user text contains high-severity emotional cues.

    This is a *stricter* signal than ``detect_emotion`` — it fires only on
    words/phrases that indicate real emotional distress (e.g. depression,
    burnout, self-harm, hopelessness). Callers use this to override
    mode-level tone rules: a distressed message always deserves warmth
    and space, even if the user picked a "short" mode like Buddy.

    Like ``detect_emotion`` this function is pure, offline, and never
    raises.
    """
    try:
        normalized = _normalize(text)
        if not normalized:
            return False
        for cue in _DISTRESS_CUES:
            if cue in normalized:
                return True
        return False
    except Exception:
        return False
