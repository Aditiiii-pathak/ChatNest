/* ── Public read-only view of a shared conversation ───────────────────────
 *
 * Rendered at ``/shared/<token>``. No authentication required — the
 * backend only returns the conversation when the token exists and has
 * not been revoked. We intentionally do not reuse ``useAuthStore``: a
 * viewer without an account must be able to read the chat.
 */

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import Loader from "@/components/Loader";
import MarkdownContent from "@/components/MarkdownContent";
import { fetchSharedConversation } from "@/services/chat";
import type { PublicSharedConversation } from "@/types";

export default function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [data, setData] = useState<PublicSharedConversation | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "missing" | "error">(
    "loading",
  );

  useEffect(() => {
    let alive = true;
    fetchSharedConversation(token)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setStatus("ok");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const httpStatus = (err as any)?.response?.status;
        setStatus(httpStatus === 404 ? "missing" : "error");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <BrandLogo size="md" />
          <Loader size="md" />
          <p className="text-sm text-zinc-500">Loading shared chat…</p>
        </div>
      </div>
    );
  }

  if (status === "missing") {
    return <UnavailableState title="This shared chat isn't available" reason="The link has been revoked, or the chat has been deleted." />;
  }

  if (status === "error" || !data) {
    return <UnavailableState title="Couldn't load this chat" reason="Something went wrong on our end. Please try again later." />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="safe-top sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo size="sm" />
            <span className="text-sm font-semibold text-zinc-100">
              ChatNest
            </span>
          </Link>

          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3 w-3"
            >
              <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
            </svg>
            Shared
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-xl font-semibold sm:text-2xl">
          {data.title?.trim() ? data.title : "Shared conversation"}
        </h1>
        <p className="mb-6 text-xs text-zinc-500">
          {data.messages.length}{" "}
          {data.messages.length === 1 ? "message" : "messages"} · Shared
          read-only from ChatNest
        </p>

        <div className="space-y-4">
          {data.messages.length === 0 ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
              This chat has no messages yet.
            </p>
          ) : (
            data.messages.map((msg) => (
              <SharedBubble
                key={`${msg.sequence_number}-${msg.created_at}`}
                role={msg.role}
                content={msg.content}
              />
            ))
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="safe-bottom border-t border-zinc-800 bg-zinc-950/80 px-4 py-4 text-center text-xs text-zinc-500 sm:px-6">
        <p>
          Built with{" "}
          <Link
            href="/"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            ChatNest
          </Link>
          . Start your own AI chats with semantic memory.
        </p>
      </footer>
    </div>
  );
}

/* ── Message bubble (simpler than the authenticated one — no actions) ── */

function SharedBubble({
  role,
  content,
}: {
  role: string;
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`
          max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[85%]
          ${
            isUser
              ? "bg-emerald-600/90 text-white"
              : "bg-zinc-900 text-zinc-100 ring-1 ring-zinc-800"
          }
        `}
      >
        <MarkdownContent
          content={content}
          variant={isUser ? "user" : "assistant"}
        />
      </div>
    </div>
  );
}

/* ── Error / missing state ─────────────────────────────────────────────── */

function UnavailableState({
  title,
  reason,
}: {
  title: string;
  reason: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 px-6 text-center">
      <BrandLogo size="md" />
      <h1 className="mt-6 text-xl font-semibold text-zinc-100">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">{reason}</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
      >
        Go to ChatNest
      </Link>
    </div>
  );
}
