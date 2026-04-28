/* ── Cmd/Ctrl+K global search palette ─────────────────────────────────────
 *
 * Fuses keyword + semantic hits (see ``GET /search/global``) into a single
 * ranked list, groups results by conversation, and lets the user jump
 * directly to a message.
 *
 * Interaction:
 *   * Cmd/Ctrl+K toggles the palette anywhere on the page.
 *   * ↑/↓ navigates, Enter activates, Esc closes.
 *   * Clicking or Enter-ing a hit loads that conversation and scrolls to
 *     the message (best-effort — we dispatch a custom event that
 *     ``ChatWindow`` can listen for).
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChatStore } from "@/store/useChatStore";
import { searchAll } from "@/services/chat";
import type { GlobalSearchHit } from "@/types";

const DEBOUNCE_MS = 200;

export default function CommandPalette() {
  const setActive = useChatStore((s) => s.setActiveConversation);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /* ── Global hotkey ─────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac =
        typeof navigator !== "undefined" &&
        /mac/i.test(navigator.platform ?? "");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Focus input whenever the palette opens. */
  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* ── Debounced search ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await searchAll(q, 25);
        setHits(res.hits);
        setCursor(0);
      } catch (err) {
        console.error("Global search failed:", err);
        setHits([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, open]);

  /* ── Group hits by conversation (preserving rank) ──────────────────── */
  const grouped = useMemo(() => {
    const order: string[] = [];
    const byConvo = new Map<
      string,
      { title: string | null; items: GlobalSearchHit[] }
    >();
    for (const hit of hits) {
      if (!byConvo.has(hit.conversation_id)) {
        byConvo.set(hit.conversation_id, {
          title: hit.conversation_title,
          items: [],
        });
        order.push(hit.conversation_id);
      }
      byConvo.get(hit.conversation_id)!.items.push(hit);
    }
    return order.map((id) => ({ convoId: id, ...byConvo.get(id)! }));
  }, [hits]);

  /* Flatten for keyboard navigation. */
  const flatHits = hits;

  const activate = useCallback(
    async (hit: GlobalSearchHit) => {
      setOpen(false);
      await setActive(hit.conversation_id);
      /* Signal the chat window to scroll to this message. */
      window.dispatchEvent(
        new CustomEvent("chatnest:highlight-message", {
          detail: { messageId: hit.message_id },
        }),
      );
    },
    [setActive],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, Math.max(flatHits.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = flatHits[cursor];
        if (hit) void activate(hit);
      }
    },
    [flatHits, cursor, activate],
  );

  /* Scroll the cursored item into view. */
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-hit-index="${cursor}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search conversations"
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search input ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-zinc-500"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search across all chats…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            aria-label="Search query"
          />
          <kbd className="hidden rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 sm:inline">
            Esc
          </kbd>
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto"
        >
          {query.trim() === "" ? (
            <EmptyHint />
          ) : isSearching && hits.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-500">
              Searching…
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-500">
              No matches for &quot;{query}&quot;
            </p>
          ) : (
            <ul className="py-2">
              {grouped.map((g) => (
                <li key={g.convoId} className="mb-1">
                  <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    {g.title ?? "Untitled"}
                  </div>
                  {g.items.map((hit) => {
                    const flatIndex = flatHits.findIndex(
                      (h) => h.message_id === hit.message_id,
                    );
                    const active = flatIndex === cursor;
                    return (
                      <button
                        key={hit.message_id}
                        data-hit-index={flatIndex}
                        onMouseEnter={() => setCursor(flatIndex)}
                        onClick={() => void activate(hit)}
                        className={`
                          group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors
                          ${
                            active
                              ? "bg-emerald-500/10"
                              : "hover:bg-zinc-900"
                          }
                        `}
                      >
                        <RoleBadge role={hit.role} />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`
                              line-clamp-2 text-sm leading-snug
                              ${
                                active
                                  ? "text-zinc-100"
                                  : "text-zinc-300"
                              }
                            `}
                          >
                            <HitSnippet snippet={hit.snippet} query={query} />
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
                            <span>{hit.role}</span>
                            <span>·</span>
                            <MatchBadge type={hit.match_type} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span>
            {hits.length > 0 ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : ""}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5">↑↓</kbd>
              nav
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5">↵</kbd>
              open
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ───────────────────────────────────────────────────── */

function RoleBadge({ role }: { role: string }) {
  const isUser = role === "user";
  return (
    <span
      className={`
        mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold uppercase
        ${
          isUser
            ? "bg-zinc-800 text-zinc-300"
            : "bg-emerald-500/20 text-emerald-300"
        }
      `}
      aria-hidden
    >
      {isUser ? "U" : "AI"}
    </span>
  );
}

function MatchBadge({ type }: { type: GlobalSearchHit["match_type"] }) {
  const label =
    type === "both" ? "best" : type === "keyword" ? "text" : "meaning";
  const tint =
    type === "both"
      ? "text-emerald-400"
      : type === "keyword"
        ? "text-sky-400"
        : "text-violet-400";
  return <span className={tint}>{label}</span>;
}

function HitSnippet({ snippet, query }: { snippet: string; query: string }) {
  /* Highlight literal matches of ``query`` inside the snippet. */
  const q = query.trim();
  if (!q) return <>{snippet}</>;
  const parts = snippet.split(new RegExp(`(${escapeRegex(q)})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded bg-emerald-500/20 px-0.5 text-emerald-200"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function EmptyHint() {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-zinc-400">Search across every chat</p>
      <p className="mt-2 text-xs text-zinc-600">
        Matches both exact words and related meaning.
      </p>
    </div>
  );
}
