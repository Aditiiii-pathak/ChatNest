/* ── Login page ────────────────────────────────────────────────────────────── */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import Loader from "@/components/Loader";
import BrandLogo from "@/components/BrandLogo";

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, clearError, token } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  /* Redirect if already logged in */
  useEffect(() => {
    if (token) router.replace("/");
  }, [token, router]);

  /* Clear errors on mount */
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    try {
      await login(email, password);
      router.replace("/");
    } catch { /* error handled by store */ }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      {/* Gradient glow background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-600/8 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[400px] w-[600px] rounded-full bg-violet-600/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center shadow-xl shadow-emerald-900/20">
            <BrandLogo size="md" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to ChatNest</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md p-6 shadow-2xl shadow-black/20"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 pr-12 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" />
                    <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" />
                    <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                    <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
          >
            {isLoading ? <Loader size="sm" /> : null}
            {isLoading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-emerald-400 underline-offset-2 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
