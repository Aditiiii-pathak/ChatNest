/* ── Composer draft store ────────────────────────────────────────────────
 * A minimal bridge so any component can push a suggested prompt into the
 * chat input without making ``ChatInput``'s local state a child-prop or
 * a context. ``ChatInput`` watches ``pendingPrompt`` — when it flips to
 * a non-null value, it copies the text into its textarea and clears the
 * pending state. */

import { create } from "zustand";

interface ComposerState {
  pendingPrompt: string | null;
  setPendingPrompt: (text: string) => void;
  clearPendingPrompt: () => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  pendingPrompt: null,
  setPendingPrompt: (text) => set({ pendingPrompt: text }),
  clearPendingPrompt: () => set({ pendingPrompt: null }),
}));
