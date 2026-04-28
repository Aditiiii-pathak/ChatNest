/* ── Main chat page — auth-guarded ─────────────────────────────────────── */

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import Loader from "@/components/Loader";
import BrandLogo from "@/components/BrandLogo";
import CommandPalette from "@/components/CommandPalette";

function LoadingSplash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <BrandLogo
          size="md"
          className="rounded-2xl shadow-xl shadow-emerald-900/30"
        />
        <Loader size="md" />
        <p className="text-sm text-zinc-500">Loading ChatNest…</p>
      </div>
    </div>
  );
}

/* PWA-shortcut handler.
 * Consumes ``?new=1`` from the manifest's "New chat" shortcut and spawns
 * a fresh conversation. Kept in its own component so ``useSearchParams``
 * can live inside a Suspense boundary (required by Next.js). */
function PwaShortcutHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const newConversation = useChatStore((s) => s.newConversation);

  useEffect(() => {
    if (!token) return;
    if (searchParams.get("new") !== "1") return;
    newConversation()
      .catch(() => {
        /* silent — the user can retry from the sidebar */
      })
      .finally(() => {
        router.replace("/");
      });
  }, [token, searchParams, newConversation, router]);

  return null;
}

export default function HomePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const loadUser = useAuthStore((s) => s.loadUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("chatnest_token");
    if (!stored) {
      router.replace("/login");
      return;
    }
    loadUser().finally(() => setReady(true));
  }, [loadUser, router]);

  useEffect(() => {
    if (ready && !token) {
      router.replace("/login");
    }
  }, [ready, token, router]);

  if (!ready || !user) {
    return <LoadingSplash />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950">
      <Suspense fallback={null}>
        <PwaShortcutHandler />
      </Suspense>
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatWindow />
        <ChatInput />
      </main>
      <CommandPalette />
    </div>
  );
}
