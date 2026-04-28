/* ── Chat Zustand store ────────────────────────────────────────────────────── */

import { create } from "zustand";
import type { Conversation, Message } from "@/types";
import {
  fetchConversations,
  createConversation,
  fetchMessages,
  deleteConversation,
  updateConversation as apiUpdateConversation,
  editMessage as apiEditMessage,
  deleteMessage as apiDeleteMessage,
} from "@/services/chat";

interface ChatState {
  /* data */
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  isStreaming: boolean;
  streamingContent: string;

  /* actions */
  loadConversations: () => Promise<void>;
  setActiveConversation: (id: string) => Promise<void>;
  newConversation: () => Promise<string>;
  removeConversation: (id: string) => Promise<boolean>;
  addMessage: (msg: Message) => void;
  appendStreamToken: (token: string) => void;
  finalizeStream: (msg: Message) => void;
  setSending: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  resetStreamContent: () => void;
  refreshConversations: () => Promise<void>;
  /** Patch the title of a single conversation in place (used by the
   *  auto-title SSE event so we don't need a list refetch). */
  patchConversationTitle: (id: string, title: string) => void;
  updateMessage: (id: string, content: string) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoadingConversations: false,
  isLoadingMessages: false,
  isSending: false,
  isStreaming: false,
  streamingContent: "",

  loadConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const data = await fetchConversations();
      set({ conversations: data, isLoadingConversations: false });
    } catch {
      set({ isLoadingConversations: false });
    }
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, isLoadingMessages: true, messages: [] });
    try {
      const data = await fetchMessages(id);
      set({ messages: data.messages, isLoadingMessages: false });
    } catch {
      set({ isLoadingMessages: false });
    }
  },

  newConversation: async () => {
    const convo = await createConversation();
    const { conversations } = get();
    set({
      conversations: [
        {
          conversation_id: convo.id,
          title: convo.title,
          last_message_preview: null,
          updated_at: convo.updated_at,
        },
        ...conversations,
      ],
      activeConversationId: convo.id,
      messages: [],
    });
    return convo.id;
  },

  removeConversation: async (id) => {
    try {
      await deleteConversation(id);
    } catch (e) {
      console.error("Failed to delete conversation:", e);
      return false;
    }
    const { conversations, activeConversationId } = get();
    const filtered = conversations.filter((c) => c.conversation_id !== id);
    set({
      conversations: filtered,
      ...(activeConversationId === id
        ? { activeConversationId: null, messages: [] }
        : {}),
    });
    return true;
  },

  addMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  appendStreamToken: (token) => {
    set((s) => ({ streamingContent: s.streamingContent + token }));
  },

  finalizeStream: (msg) => {
    set((s) => ({
      messages: [...s.messages, msg],
      streamingContent: "",
      isStreaming: false,
    }));
  },

  setSending: (v) => set({ isSending: v }),
  setStreaming: (v) => set({ isStreaming: v }),
  resetStreamContent: () => set({ streamingContent: "" }),

  refreshConversations: async () => {
    try {
      const data = await fetchConversations();
      set({ conversations: data });
    } catch {
      /* silent */
    }
  },

  patchConversationTitle: (id, title) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversation_id === id ? { ...c, title } : c,
      ),
    }));
  },

  updateMessage: async (id, content) => {
    await apiEditMessage(id, content);
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content } : m
      ),
    }));
  },

  removeMessage: async (id) => {
    await apiDeleteMessage(id);
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
    }));
  },

  renameConversation: async (id, title) => {
    await apiUpdateConversation(id, { title });
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.conversation_id === id ? { ...c, title } : c
      ),
    }));
  },

  archiveConversation: async (id) => {
    await apiUpdateConversation(id, { is_archived: true });
    set((s) => ({
      conversations: s.conversations.filter((c) => c.conversation_id !== id),
      ...(s.activeConversationId === id
        ? { activeConversationId: null, messages: [] }
        : {}),
    }));
  },
}));
