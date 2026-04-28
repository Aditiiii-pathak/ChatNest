/* ── Chat window — messages area ───────────────────────────────────────── */

"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/useChatStore";
import { useIncognitoStore } from "@/store/useIncognitoStore";
import { useComposerStore } from "@/store/useComposerStore";
import MessageBubble from "./MessageBubble";
import StreamingBubble from "./StreamingBubble";
import Loader from "./Loader";
import BrandLogo from "./BrandLogo";
import MarkdownContent from "./MarkdownContent";

/* Prompt suggestion cards shown on the welcome screen. Each one becomes a
 * tappable chip on mobile and a card on larger screens. */
const PROMPT_SUGGESTIONS: { label: string; prompt: string; icon: string }[] = [
  {
    icon: "⚛️",
    label: "Explain quantum computing simply",
    prompt: "Explain quantum computing like I'm a curious high-schooler.",
  },
  {
    icon: "🐍",
    label: "Python sorting algorithm",
    prompt: "Write a clean Python quicksort with a short explanation of how it works.",
  },
  {
    icon: "🧠",
    label: "Latest AI trends",
    prompt: "Summarize the three most important AI trends in the last 12 months.",
  },
  {
    icon: "✉️",
    label: "Draft a professional email",
    prompt:
      "Help me draft a polite but firm professional email asking a client for an overdue invoice.",
  },
];

export default function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeId = useChatStore((s) => s.activeConversationId);

  const incognito = useIncognitoStore((s) => s.enabled);
  const incMessages = useIncognitoStore((s) => s.messages);
  const incStreaming = useIncognitoStore((s) => s.isStreaming);
  const incStreamingContent = useIncognitoStore((s) => s.streamingContent);
  const incMode = useIncognitoStore((s) => s.mode);
  const clearIncSession = useIncognitoStore((s) => s.clearSession);

  const setPendingPrompt = useComposerStore((s) => s.setPendingPrompt);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, incMessages, incStreaming, incStreamingContent]);

  /* ── Highlight-message-on-jump (fired by the Command Palette) ─────────
   *
   * Scrolls the target bubble into view and flashes a subtle ring for
   * ~1.2s so the eye can latch onto it. Waits for the next paint so
   * freshly-loaded message history has a chance to mount. */
  useEffect(() => {
    const onHighlight = (e: Event) => {
      const detail = (e as CustomEvent<{ messageId?: string }>).detail;
      const id = detail?.messageId;
      if (!id) return;

      /* Poll a few frames in case messages are still loading. */
      let attempts = 0;
      const tryScroll = () => {
        const el = document.querySelector<HTMLElement>(
          `[data-message-id="${id}"]`,
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-emerald-400/70");
          window.setTimeout(() => {
            el.classList.remove("ring-2", "ring-emerald-400/70");
          }, 1400);
          return;
        }
        if (attempts++ < 20) requestAnimationFrame(tryScroll);
      };
      requestAnimationFrame(tryScroll);
    };
    window.addEventListener("chatnest:highlight-message", onHighlight);
    return () =>
      window.removeEventListener("chatnest:highlight-message", onHighlight);
  }, []);

  /* ── Incognito view ──────────────────────────────────────────────────
   * When incognito is on, we never render the persistent transcript —
   * that would defeat the "no past context" promise visually. Users see
   * only the current private session. */
  if (incognito) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Privacy banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-500/30 bg-gradient-to-r from-violet-900/30 via-violet-900/10 to-transparent px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" />
                <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" />
                <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-violet-100">
                Incognito Mode · {incMode === "default" ? "Default" : incMode === "buddy" ? "Buddy" : "Emotional"}
              </p>
              <p className="truncate text-[11px] text-violet-300/70">
                Messages, embeddings and memory are off. This session lives only in this tab.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={clearIncSession}
            className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-500/20"
            title="Forget this session and start fresh"
          >
            Clear session
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scroll-smooth px-4 py-6">
          <div className="mx-auto max-w-3xl">
            {incMessages.length === 0 && !incStreaming ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                    <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" />
                    <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" />
                    <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-zinc-100">You&apos;re in Incognito</h3>
                <p className="mt-1 max-w-md text-sm text-zinc-400">
                  Say anything — nothing from this chat will be stored,
                  searched, or used to train memory.
                </p>
              </div>
            ) : (
              incMessages.map((m) => (
                <div
                  key={m.local_id}
                  className={`mb-4 flex w-full ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`
                      relative max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg sm:max-w-[85%]
                      ${
                        m.role === "user"
                          ? "rounded-br-md bg-violet-600 text-white shadow-violet-600/20"
                          : "rounded-bl-md border border-violet-800/40 bg-zinc-900 text-zinc-100 shadow-black/30"
                      }
                    `}
                  >
                    <div
                      className={`mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider ${
                        m.role === "user" ? "text-violet-200" : "text-violet-300/80"
                      }`}
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          m.role === "user" ? "bg-violet-200" : "bg-violet-400"
                        }`}
                      />
                      {m.role === "user" ? "You (private)" : "ChatNest · Incognito"}
                      {m.emotion && m.role === "assistant" && (
                        <span className="ml-auto rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-200">
                          {m.emotion}
                        </span>
                      )}
                    </div>

                    <MarkdownContent
                      content={m.content}
                      variant={m.role === "user" ? "user" : "assistant"}
                    />
                  </div>
                </div>
              ))
            )}

            {/* Live streaming bubble */}
            {incStreaming && incStreamingContent && (
              <div className="mb-4 flex w-full justify-start">
                <div className="relative max-w-[92%] rounded-2xl rounded-bl-md border border-violet-800/40 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-100 shadow-lg shadow-black/30 sm:max-w-[85%]">
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-violet-300/80">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                    ChatNest · Incognito
                  </div>
                  <MarkdownContent content={incStreamingContent} variant="assistant" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Empty state (persistent) ────────────────────────────────────────── */
  if (!activeId) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center text-center">
          <div className="mb-5 shadow-xl shadow-emerald-900/25 sm:mb-6">
            <BrandLogo size="xl" />
          </div>

          <h2 className="mb-2 text-xl font-semibold text-zinc-100 sm:text-2xl">
            Welcome to ChatNest
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-zinc-400">
            Start a new conversation or pick one from the sidebar.
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-zinc-600">
            Powered by Gemini · with semantic memory
          </p>

          <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:mt-8 sm:grid-cols-2 sm:gap-3">
            {PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setPendingPrompt(s.prompt)}
                className="
                  group flex items-start gap-3 rounded-xl border border-zinc-700/60 bg-zinc-800/50
                  px-3.5 py-3 text-left text-[13px] text-zinc-300 transition-all
                  hover:border-emerald-500/40 hover:bg-zinc-800 hover:text-zinc-100
                  active:scale-[0.98]
                "
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-base leading-none transition-colors group-hover:bg-emerald-600/15"
                  aria-hidden
                >
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{s.label}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-emerald-400"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingMessages) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader size="lg" />
          <p className="text-sm text-zinc-500">Loading messages…</p>
        </div>
      </div>
    );
  }

  /* ── Messages list (persistent) ──────────────────────────────────────── */
  return (
    <div className="flex-1 overflow-y-auto scroll-smooth px-4 py-6">
      <div className="mx-auto max-w-3xl">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-zinc-500 text-sm">
              Send a message to start the conversation.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            data-message-id={msg.id}
            className="rounded-2xl transition-[box-shadow] duration-300"
          >
            <MessageBubble message={msg} />
          </div>
        ))}

        <StreamingBubble />

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
