/* ── Streaming bubble — renders the in-progress assistant response ─────── */

"use client";

import { useChatStore } from "@/store/useChatStore";
import MarkdownContent from "./MarkdownContent";

export default function StreamingBubble() {
  const content = useChatStore((s) => s.streamingContent);
  const isStreaming = useChatStore((s) => s.isStreaming);

  if (!isStreaming && !content) return null;

  return (
    <div className="flex w-full justify-start mb-4">
      <div className="relative max-w-[75%] rounded-2xl rounded-bl-md bg-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100 shadow-lg shadow-zinc-900/30 border border-zinc-700/50">
        {/* Header */}
        <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
          ChatNest AI
        </div>

        {/* Streaming content — Markdown updates as tokens arrive */}
        <div className="relative">
          <MarkdownContent content={content} variant="assistant" />
          <span className="inline-block w-[2px] h-[14px] bg-emerald-400 ml-0.5 animate-pulse align-text-bottom" />
        </div>
      </div>
    </div>
  );
}
