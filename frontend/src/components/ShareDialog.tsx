/* ── Share-a-conversation modal ────────────────────────────────────────
 *
 * Displayed when the user clicks "Share" on a sidebar conversation. It
 * lazily fetches the current share status, lets the user generate a link
 * (or copy the existing one), and revoke access.
 *
 * Public viewers load the link at ``/shared/<token>`` — no auth required.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createShare,
  getShareStatus,
  revokeShare,
} from "@/services/chat";
import type { ShareStatusResponse } from "@/types";

interface ShareDialogProps {
  conversationId: string;
  conversationTitle?: string | null;
  onClose: () => void;
}

export default function ShareDialog({
  conversationId,
  conversationTitle,
  onClose,
}: ShareDialogProps) {
  const [status, setStatus] = useState<ShareStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    getShareStatus(conversationId)
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch((e) => {
        if (alive) setError(friendlyError(e));
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fullUrl = status?.url
    ? (typeof window !== "undefined" ? window.location.origin : "") +
      status.url
    : "";

  const handleCreate = useCallback(async () => {
    setIsWorking(true);
    setError(null);
    try {
      const share = await createShare(conversationId);
      setStatus({
        conversation_id: share.conversation_id,
        is_shared: true,
        token: share.token,
        url: share.url,
        created_at: share.created_at,
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }, [conversationId]);

  const handleRevoke = useCallback(async () => {
    setIsWorking(true);
    setError(null);
    try {
      await revokeShare(conversationId);
      setStatus({
        conversation_id: conversationId,
        is_shared: false,
      });
      setCopied(false);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }, [conversationId]);

  const handleCopy = useCallback(async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can fail on http:// contexts — fall back silently */
      setError("Couldn't copy to clipboard. Copy the link manually.");
    }
  }, [fullUrl]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Share conversation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-100">
              Share chat
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {conversationTitle ?? "Untitled"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">
          {isLoading ? (
            <p className="py-6 text-center text-xs text-zinc-500">Loading…</p>
          ) : status?.is_shared && fullUrl ? (
            <>
              <p className="mb-3 text-sm text-zinc-300">
                Anyone with this link can view this chat as read-only.
              </p>

              <div className="flex items-stretch gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <input
                  readOnly
                  value={fullUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none"
                  aria-label="Share URL"
                />
                <button
                  onClick={handleCopy}
                  className="rounded-lg bg-emerald-600/90 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-600">
                  Viewers won&apos;t see your email, later messages aren&apos;t
                  auto-synced — share again for a fresh snapshot.
                </p>
                <button
                  onClick={handleRevoke}
                  disabled={isWorking}
                  className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  {isWorking ? "Revoking…" : "Revoke"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-300">
                Create a public link to this chat. Anyone with the link can
                view it — no sign-in required.
              </p>
              <ul className="mt-3 space-y-1.5 text-[11px] text-zinc-500">
                <li>· Read-only. No one can reply to the shared copy.</li>
                <li>· Revoke at any time with a single click.</li>
                <li>· New messages won&apos;t auto-sync into the link.</li>
              </ul>

              <button
                onClick={handleCreate}
                disabled={isWorking}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {isWorking ? "Creating link…" : "Create share link"}
              </button>
            </>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function friendlyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
