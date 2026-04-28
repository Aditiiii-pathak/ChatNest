/* ── Chat input bar ──────────────────────────────────────────────────────── */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useChatStore } from "@/store/useChatStore";
import { useIncognitoStore } from "@/store/useIncognitoStore";
import { useComposerStore } from "@/store/useComposerStore";
import { useModeStore } from "@/store/useModeStore";
import { useStreaming } from "@/hooks/useStreaming";
import type { BehaviorMode } from "@/types";

/* ── Mode metadata ─────────────────────────────────────────────────────────
 * Display info for the mode picker. The functional behavior (prompt + temp +
 * max tokens) lives entirely on the backend in ``behavior_service.py`` —
 * this file only controls how each mode is presented.
 */
interface ModeMeta {
  id: BehaviorMode;
  label: string;
  description: string;
  icon: string;
  /** Tailwind text color for the icon. Keeps the picker scannable. */
  tint: string;
}

const MODE_OPTIONS: ModeMeta[] = [
  {
    id: "default",
    label: "Default",
    description: "Clear, structured replies",
    icon: "✨",
    tint: "text-zinc-300",
  },
  {
    id: "buddy",
    label: "Buddy",
    description: "Short, casual, human — like texting a friend",
    icon: "💬",
    tint: "text-amber-300",
  },
  {
    id: "concise",
    label: "Concise",
    description: "TL;DR mode — under 60 words, no filler",
    icon: "⚡",
    tint: "text-yellow-300",
  },
  {
    id: "expert",
    label: "Expert",
    description: "Deep technical detail, assumes domain knowledge",
    icon: "🧪",
    tint: "text-sky-300",
  },
  {
    id: "creative",
    label: "Creative",
    description: "Vivid, playful, idea-rich — for writing & brainstorms",
    icon: "🎨",
    tint: "text-pink-300",
  },
  {
    id: "coding",
    label: "Coding",
    description: "Code-first, minimal prose, edge cases noted",
    icon: "💻",
    tint: "text-emerald-300",
  },
  {
    id: "study",
    label: "Study",
    description: "Socratic teacher — builds intuition step by step",
    icon: "📚",
    tint: "text-orange-300",
  },
  {
    id: "emotional",
    label: "Emotional",
    description: "Empathetic support — calm, validating tone",
    icon: "💜",
    tint: "text-violet-300",
  },
];

const MODE_BY_ID: Record<BehaviorMode, ModeMeta> = MODE_OPTIONS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<BehaviorMode, ModeMeta>,
);

export default function ChatInput() {
  const [text, setText] = useState("");
  const [modeOpen, setModeOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  const activeId = useChatStore((s) => s.activeConversationId);
  const isSending = useChatStore((s) => s.isSending);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const newConversation = useChatStore((s) => s.newConversation);

  const incognito = useIncognitoStore((s) => s.enabled);
  const setIncognito = useIncognitoStore((s) => s.setEnabled);
  const incSending = useIncognitoStore((s) => s.isSending);
  const incStreaming = useIncognitoStore((s) => s.isStreaming);
  const rotateSession = useIncognitoStore((s) => s.rotateSession);

  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);
  const activeMode = MODE_BY_ID[mode] ?? MODE_BY_ID.default;

  const pendingPrompt = useComposerStore((s) => s.pendingPrompt);
  const clearPendingPrompt = useComposerStore((s) => s.clearPendingPrompt);

  const { sendStreaming, sendStreamingIncognito } = useStreaming();

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  /* Consume pending prompts pushed by the welcome screen's suggestion cards. */
  useEffect(() => {
    if (!pendingPrompt) return;
    setText(pendingPrompt);
    clearPendingPrompt();
    /* Let the DOM commit before measuring / focusing */
    requestAnimationFrame(() => {
      adjustHeight();
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [pendingPrompt, clearPendingPrompt, adjustHeight]);

  /* Close the mode picker on outside click */
  useEffect(() => {
    if (!modeOpen) return;
    const onClick = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [modeOpen]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (incognito) {
      if (incSending || incStreaming) return;
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      await sendStreamingIncognito(trimmed);
      return;
    }

    if (isSending || isStreaming) return;

    let convoId = activeId;
    if (!convoId) {
      try {
        convoId = await newConversation();
      } catch {
        return;
      }
    }

    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendStreaming(convoId, trimmed);
  }, [
    text,
    incognito,
    incSending,
    incStreaming,
    isSending,
    isStreaming,
    activeId,
    newConversation,
    sendStreaming,
    sendStreamingIncognito,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const disabled = incognito
    ? incSending || incStreaming
    : isSending || isStreaming;

  const handleToggleIncognito = () => {
    const next = !incognito;
    setIncognito(next);
    /* Rotating the session whenever we toggle guarantees that a new
       private session never inherits turns from a prior one. */
    rotateSession();
  };

  return (
    <div
      className={`safe-bottom border-t backdrop-blur-md px-3 pt-3 transition-colors sm:px-4 ${
        incognito
          ? "border-violet-500/30 bg-zinc-950/80"
          : "border-zinc-800 bg-zinc-900/80"
      }`}
    >
      {/* ── Control row ──────────────────────────────────────────────── */}
      <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Incognito toggle */}
          <button
            type="button"
            onClick={handleToggleIncognito}
            aria-pressed={incognito}
            title={
              incognito
                ? "Incognito is ON — nothing is saved"
                : "Enable Incognito Mode (private, non-persistent)"
            }
            className={`
              group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium
              transition-all
              ${
                incognito
                  ? "border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/20"
                  : "border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }
            `}
          >
            {/* Eye-slash icon when on, eye when off */}
            {incognito ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" />
                <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" />
                <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                <path
                  fillRule="evenodd"
                  d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {incognito ? "Incognito ON" : "Incognito"}
          </button>

          {/* Mode picker */}
          <div ref={modeMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setModeOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
              title={`Mode: ${activeMode.label} — ${activeMode.description}`}
            >
              <span className={`text-sm leading-none ${activeMode.tint}`} aria-hidden>
                {activeMode.icon}
              </span>
              {activeMode.label}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 opacity-70">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {modeOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-30 mb-2 max-h-[60vh] w-72 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/50"
              >
                <div className="border-b border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Assistant mode
                </div>
                {MODE_OPTIONS.map((m) => {
                  const selected = m.id === mode;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setMode(m.id);
                        setModeOpen(false);
                      }}
                      className={`
                        flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors
                        ${
                          selected
                            ? "bg-emerald-600/15"
                            : "hover:bg-zinc-800"
                        }
                      `}
                    >
                      <span
                        className={`mt-0.5 text-base leading-none ${m.tint}`}
                        aria-hidden
                      >
                        {m.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-xs font-semibold ${
                            selected ? "text-emerald-200" : "text-zinc-100"
                          }`}
                        >
                          {m.label}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-zinc-500">
                          {m.description}
                        </span>
                      </span>
                      {selected && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Privacy tag on the right when on */}
        {incognito && (
          <span className="hidden items-center gap-1.5 text-[11px] text-violet-300/80 sm:inline-flex">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            Nothing will be saved
          </span>
        )}
      </div>

      {/* ── Input row ─────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-3xl items-end gap-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            incognito
              ? "Incognito — this message won't be saved…"
              : "Type a message…"
          }
          rows={1}
          disabled={disabled}
          className={`
            flex-1 resize-none rounded-xl border px-4 py-3 text-base outline-none
            transition-colors disabled:opacity-40 sm:text-sm
            ${
              incognito
                ? "border-violet-700/50 bg-zinc-900 text-zinc-100 placeholder-violet-400/40 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30"
                : "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
            }
          `}
        />

        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className={`
            flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white
            transition-all active:scale-95 disabled:opacity-30
            ${
              incognito
                ? "bg-violet-600 hover:bg-violet-500 disabled:hover:bg-violet-600"
                : "bg-emerald-600 hover:bg-emerald-500 disabled:hover:bg-emerald-600"
            }
          `}
          aria-label="Send message"
        >
          {disabled ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          )}
        </button>
      </div>

      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-zinc-600">
        {incognito
          ? "Incognito Mode: messages, embeddings, and memory are disabled for this turn."
          : "ChatNest may produce inaccurate information. Verify important facts."}
      </p>
    </div>
  );
}
