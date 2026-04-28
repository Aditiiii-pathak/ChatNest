/* ── SSE streaming hook for POST /message/stream ──────────────────────────
 * Exposes two streaming flows:
 *
 *   sendStreaming(conversationId, content)
 *       persistent chat — writes to the DB via the server, updates
 *       ``useChatStore``.
 *
 *   sendStreamingIncognito(content)
 *       privacy-first chat — the server never writes anything; tokens
 *       are appended to ``useIncognitoStore`` which lives only in this
 *       tab's memory.
 */

"use client";

import { useCallback, useRef } from "react";
import { useChatStore } from "@/store/useChatStore";
import { useIncognitoStore } from "@/store/useIncognitoStore";
import { useModeStore } from "@/store/useModeStore";
import { API_BASE } from "@/services/api";
import type { IncognitoMessage, Message } from "@/types";

export function useStreaming() {
  const abortRef = useRef<AbortController | null>(null);

  const {
    addMessage,
    appendStreamToken,
    finalizeStream,
    setSending,
    setStreaming,
    resetStreamContent,
    refreshConversations,
    patchConversationTitle,
  } = useChatStore.getState();

  /* ── Persistent streaming ────────────────────────────────────────────── */
  const sendStreaming = useCallback(
    async (conversationId: string, content: string) => {
      const token = localStorage.getItem("chatnest_token");
      if (!token) return;

      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        role: "user",
        content,
        token_count: content.split(" ").length,
        sequence_number: 0,
        created_at: new Date().toISOString(),
      };
      addMessage(tempUserMsg);

      setSending(true);
      setStreaming(true);
      resetStreamContent();

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      /* Pull the latest mode at send-time so the user's last toggle
         always wins, even if they changed it between keystrokes. */
      const mode = useModeStore.getState().mode;

      try {
        const res = await fetch(`${API_BASE}/message/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            content,
            mode,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          throw new Error(`Stream request failed: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const jsonStr = trimmed.slice(6);
            try {
              const chunk = JSON.parse(jsonStr);

              if (chunk.content) {
                appendStreamToken(chunk.content);
              }

              if (chunk.done) {
                const { streamingContent } = useChatStore.getState();
                const assistantMsg: Message = {
                  id: chunk.message_id ?? `stream-${Date.now()}`,
                  conversation_id: conversationId,
                  role: "assistant",
                  content: streamingContent + (chunk.content ?? ""),
                  token_count: 0,
                  sequence_number: 0,
                  created_at: new Date().toISOString(),
                };
                finalizeStream(assistantMsg);
                refreshConversations();
              }

              /* Auto-title arrives *after* done on the first turn of a
                 fresh conversation — patch the sidebar in place. */
              if (chunk.title_updated && chunk.conversation_id && chunk.title) {
                patchConversationTitle(chunk.conversation_id, chunk.title);
              }
            } catch {
              /* skip malformed JSON */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Streaming error:", err);
        }
        setStreaming(false);
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [addMessage, appendStreamToken, finalizeStream, setSending, setStreaming, resetStreamContent, refreshConversations, patchConversationTitle],
  );

  /* ── Incognito streaming ─────────────────────────────────────────────── */
  const sendStreamingIncognito = useCallback(async (content: string) => {
    const token = localStorage.getItem("chatnest_token");
    if (!token) return;

    const {
      sessionId,
      addMessage: incAddMessage,
      appendStreamToken: incAppendStreamToken,
      finalizeStream: incFinalizeStream,
      setSending: incSetSending,
      setStreaming: incSetStreaming,
      resetStream: incResetStream,
    } = useIncognitoStore.getState();
    const mode = useModeStore.getState().mode;

    const tempUser: IncognitoMessage = {
      local_id: `inc-u-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    incAddMessage(tempUser);

    incSetSending(true);
    incSetStreaming(true);
    incResetStream();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`${API_BASE}/message/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          incognito: true,
          mode,
          session_id: sessionId,
          content,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw new Error(`Incognito stream failed: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";
      let detectedEmotion: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const chunk = JSON.parse(jsonStr);

            if (chunk.content) {
              incAppendStreamToken(chunk.content);
            }

            if (chunk.done) {
              if (chunk.emotion) detectedEmotion = chunk.emotion as string;
              const { streamingContent } = useIncognitoStore.getState();
              const assistantMsg: IncognitoMessage = {
                local_id: `inc-a-${Date.now()}`,
                role: "assistant",
                content: streamingContent + (chunk.content ?? ""),
                created_at: new Date().toISOString(),
                emotion: detectedEmotion,
              };
              incFinalizeStream(assistantMsg);
            }
          } catch {
            /* skip malformed JSON */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Incognito streaming error:", err);
      }
      incSetStreaming(false);
    } finally {
      incSetSending(false);
      abortRef.current = null;
    }
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    resetStreamContent();
    useIncognitoStore.getState().setStreaming(false);
    useIncognitoStore.getState().resetStream();
  }, [setStreaming, resetStreamContent]);

  return { sendStreaming, sendStreamingIncognito, cancelStream };
}
