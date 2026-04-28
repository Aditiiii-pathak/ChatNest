/* ── Incognito chat state ─────────────────────────────────────────────────
 * Kept entirely separate from ``useChatStore`` so that:
 *   * Turning incognito on never leaks persistent messages into the
 *     private transcript.
 *   * Turning incognito off never pollutes the saved conversation with
 *     ephemeral turns.
 *   * Everything here lives in memory only; closing the tab wipes it.
 */

import { create } from "zustand";
import type { IncognitoMessage } from "@/types";
import { clearIncognitoSession } from "@/services/chat";

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `inc-${crypto.randomUUID()}`;
  }
  return `inc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface IncognitoState {
  enabled: boolean;
  sessionId: string;
  messages: IncognitoMessage[];
  streamingContent: string;
  isStreaming: boolean;
  isSending: boolean;

  setEnabled: (v: boolean) => void;
  addMessage: (msg: IncognitoMessage) => void;
  appendStreamToken: (token: string) => void;
  finalizeStream: (msg: IncognitoMessage) => void;
  setSending: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  resetStream: () => void;
  clearSession: () => Promise<void>;
  rotateSession: () => void;
}

export const useIncognitoStore = create<IncognitoState>((set, get) => ({
  enabled: false,
  sessionId: generateSessionId(),
  messages: [],
  streamingContent: "",
  isStreaming: false,
  isSending: false,

  setEnabled: (v) => set({ enabled: v }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendStreamToken: (token) =>
    set((s) => ({ streamingContent: s.streamingContent + token })),

  finalizeStream: (msg) =>
    set((s) => ({
      messages: [...s.messages, msg],
      streamingContent: "",
      isStreaming: false,
    })),

  setSending: (v) => set({ isSending: v }),
  setStreaming: (v) => set({ isStreaming: v }),
  resetStream: () => set({ streamingContent: "" }),

  clearSession: async () => {
    const { sessionId } = get();
    try {
      await clearIncognitoSession(sessionId);
    } catch {
      /* best-effort — server also auto-expires */
    }
    set({
      messages: [],
      streamingContent: "",
      isStreaming: false,
      isSending: false,
      sessionId: generateSessionId(),
    });
  },

  rotateSession: () =>
    set({
      sessionId: generateSessionId(),
      messages: [],
      streamingContent: "",
      isStreaming: false,
      isSending: false,
    }),
}));
