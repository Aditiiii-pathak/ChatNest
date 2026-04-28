/* ── Sidebar — conversation list + new chat ─────────────────────────────── */

"use client";

import { useEffect, useCallback, useState } from "react";
import { useChatStore } from "@/store/useChatStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useIncognitoStore } from "@/store/useIncognitoStore";
import Loader from "./Loader";
import BrandLogo from "./BrandLogo";
import ShareDialog from "./ShareDialog";

const MOBILE_BREAKPOINT_PX = 768; // Tailwind's ``md``

export default function Sidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const isLoadingConvos = useChatStore((s) => s.isLoadingConversations);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const newConversation = useChatStore((s) => s.newConversation);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const incognito = useIncognitoStore((s) => s.enabled);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  /* ``open`` controls the mobile drawer. Desktop (md+) always shows the
     sidebar regardless of this state via the ``md:translate-x-0`` class. */
  const [open, setOpen] = useState(false);
  const [editingConvoId, setEditingConvoId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  /* Keep the drawer closed by default on phones, open on desktop. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setOpen(window.innerWidth >= MOBILE_BREAKPOINT_PX);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX;

  const handleNewChat = useCallback(async () => {
    await newConversation();
    if (isMobile()) setOpen(false);
  }, [newConversation]);

  const handlePickConversation = useCallback(
    async (id: string) => {
      await setActiveConversation(id);
      if (isMobile()) setOpen(false);
    },
    [setActiveConversation],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDeletingId(id);
      try {
        const ok = await removeConversation(id);
        if (!ok) {
          window.alert(
            "Could not delete this chat. Check that the API is running (e.g. uvicorn on port 8000) and NEXT_PUBLIC_API_URL matches.",
          );
        }
      } finally {
        setDeletingId(null);
      }
    },
    [removeConversation],
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!renamingTitle.trim()) {
        setEditingConvoId(null);
        return;
      }
      try {
        await renameConversation(id, renamingTitle);
      } finally {
        setEditingConvoId(null);
      }
    },
    [renameConversation, renamingTitle],
  );

  /* ── Title for the mobile header ─────────────────────────────────────── */
  const activeTitle = incognito
    ? "Incognito"
    : conversations.find((c) => c.conversation_id === activeId)?.title ??
      "ChatNest";

  return (
    <>
      {/* ── Mobile top bar ────────────────────────────────────────────────
          Shown on small screens only. Sticks to the top of the chat area so
          the hamburger/new-chat buttons don't collide with the content. */}
      <header className="safe-top fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/90 px-3 backdrop-blur-md md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          aria-label="Open sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M3 6.75A.75.75 0 013.75 6h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6.75zM3 12a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 12zm0 5.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </button>

        <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">
          {activeTitle ?? "ChatNest"}
        </p>

        <button
          onClick={handleNewChat}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-300 transition-colors hover:bg-zinc-800 hover:text-emerald-200"
          aria-label="New chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
          </svg>
        </button>
      </header>

      {/* Spacer so main content isn't hidden under the fixed mobile header */}
      <div className="safe-top h-12 shrink-0 md:hidden" aria-hidden />

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Drawer / sidebar ──────────────────────────────────────────────
          On mobile: fixed drawer that slides in from the left.
          On md+:   static flex child of the page. */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-xs flex-col border-r border-zinc-800 bg-zinc-950
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0
        `}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="safe-top flex items-center justify-between border-b border-zinc-800 px-4 py-4">
          <div className="flex items-center gap-2">
            <BrandLogo size="sm" />
            <span className="text-base font-semibold text-zinc-100">ChatNest</span>
          </div>

          <button
            onClick={() => setOpen(false)}
            className="text-zinc-400 hover:text-white md:hidden"
            aria-label="Close sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* ── New Chat + Search buttons ───────────────────────────────── */}
        <div className="space-y-2 px-3 py-3">
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 transition-all hover:border-emerald-500/40 hover:bg-zinc-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-emerald-400">
              <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
            New Chat
          </button>

          <button
            onClick={() => {
              /* Dispatch the same hotkey the palette listens for — keeps
                 a single source of truth for the open logic. */
              const isMac =
                typeof navigator !== "undefined" &&
                /mac/i.test(navigator.platform ?? "");
              window.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "k",
                  ctrlKey: !isMac,
                  metaKey: isMac,
                  bubbles: true,
                }),
              );
              if (isMobile()) setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Search all chats"
          >
            <span className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              Search chats
            </span>
            <kbd className="hidden rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 sm:inline">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* ── Conversations list ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3">
          {isLoadingConvos ? (
            <div className="flex justify-center py-8">
              <Loader />
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No conversations yet
            </p>
          ) : (
            <ul className="space-y-0.5 pb-2">
              {conversations.map((c) => {
                const isActive = activeId === c.conversation_id;
                const isDeleting = deletingId === c.conversation_id;
                return (
                  <li key={c.conversation_id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        !isDeleting &&
                        editingConvoId !== c.conversation_id &&
                        handlePickConversation(c.conversation_id)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          !isDeleting &&
                            editingConvoId !== c.conversation_id &&
                            handlePickConversation(c.conversation_id);
                        }
                      }}
                      className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-all cursor-pointer ${
                        isActive
                          ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent"
                      } ${isDeleting ? "opacity-40" : ""}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-600"}`}>
                        <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-8.5S17.322 4 12 4s-9.75 3.97-9.75 8.5c0 2.012.738 3.87 1.975 5.334-.188.665-.518 1.267-.952 1.769a.75.75 0 00.53 1.041z" clipRule="evenodd" />
                      </svg>

                      <div className="flex-1 min-w-0">
                        {editingConvoId === c.conversation_id ? (
                          <input
                            autoFocus
                            className="w-full bg-zinc-700 text-white rounded px-1.5 py-0.5 outline-none ring-1 ring-emerald-500"
                            value={renamingTitle}
                            onChange={(e) => setRenamingTitle(e.target.value)}
                            onBlur={() => handleRename(c.conversation_id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(c.conversation_id);
                              if (e.key === "Escape") setEditingConvoId(null);
                            }}
                          />
                        ) : (
                          <span className="block truncate">
                            {c.title ?? "Untitled"}
                          </span>
                        )}
                      </div>

                      {/* Action buttons — always visible on touch devices */}
                      {!isDeleting && editingConvoId !== c.conversation_id && (
                        <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingConvoId(c.conversation_id);
                              setRenamingTitle(c.title ?? "");
                            }}
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
                            aria-label="Rename conversation"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                              <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.917 6.917a4 4 0 01-1.341.888l-3.155 1.262a.75.75 0 01-.92-.92z" />
                              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                            </svg>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSharingId(c.conversation_id);
                            }}
                            className="rounded p-1 text-zinc-500 transition-all hover:bg-emerald-500/10 hover:text-emerald-300"
                            aria-label="Share conversation"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                              <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
                            </svg>
                          </button>

                          <button
                            onClick={(e) => handleDelete(e, c.conversation_id)}
                            className="rounded p-1 text-zinc-500 transition-all hover:bg-red-500/10 hover:text-red-400"
                            aria-label="Delete conversation"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                              <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── User footer ──────────────────────────────────────────────── */}
        <div className="safe-bottom border-t border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white uppercase">
              {user?.display_name?.[0] ?? user?.email?.[0] ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">
                {user?.display_name ?? "User"}
              </p>
              <p className="truncate text-[11px] text-zinc-500">
                {user?.email}
              </p>
            </div>
            <button
              onClick={logout}
              className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
              aria-label="Sign out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M7.5 3.75A1.5 1.5 0 006 5.25v13.5a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3h-6a3 3 0 01-3-3V5.25a3 3 0 013-3h6a3 3 0 013 3V9a.75.75 0 01-1.5 0V5.25a1.5 1.5 0 00-1.5-1.5h-6zm10.72 4.72a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H9a.75.75 0 010-1.5h10.94l-1.72-1.72a.75.75 0 010-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {sharingId && (
        <ShareDialog
          conversationId={sharingId}
          conversationTitle={
            conversations.find((c) => c.conversation_id === sharingId)
              ?.title ?? null
          }
          onClose={() => setSharingId(null)}
        />
      )}
    </>
  );
}
