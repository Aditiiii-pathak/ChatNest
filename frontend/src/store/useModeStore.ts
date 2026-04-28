/* ── Behavior-mode store ──────────────────────────────────────────────────
 *
 * The selected behavior mode (Default / Buddy / Concise / Expert / …)
 * applies to BOTH persistent and incognito chats, so it lives in its own
 * store rather than being attached to either pipeline.
 *
 * The mode is persisted in ``localStorage`` so the user's preference
 * survives reloads — purely a UX nicety, never sent anywhere except as
 * part of message requests.
 */

"use client";

import { create } from "zustand";
import type { BehaviorMode } from "@/types";

const STORAGE_KEY = "chatnest_mode";

const VALID_MODES: BehaviorMode[] = [
  "default",
  "buddy",
  "emotional",
  "concise",
  "expert",
  "creative",
  "coding",
  "study",
];

function loadInitialMode(): BehaviorMode {
  if (typeof window === "undefined") return "default";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (VALID_MODES as string[]).includes(saved)) {
      return saved as BehaviorMode;
    }
  } catch {
    /* localStorage may be blocked — silently fall back */
  }
  return "default";
}

interface ModeState {
  mode: BehaviorMode;
  setMode: (m: BehaviorMode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: loadInitialMode(),
  setMode: (m) => {
    set({ mode: m });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, m);
      } catch {
        /* ignore */
      }
    }
  },
}));
