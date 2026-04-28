/* ── Auth Zustand store ────────────────────────────────────────────────────── */

import { create } from "zustand";
import type { User } from "@/types";
import { loginUser, registerUser, fetchMe } from "@/services/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  loadUser: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: typeof window !== "undefined" ? localStorage.getItem("chatnest_token") : null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await loginUser(email, password);
      localStorage.setItem("chatnest_token", res.access_token);
      set({ user: res.user, token: res.access_token, isLoading: false });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        "Login failed";
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const res = await registerUser(email, password, displayName);
      localStorage.setItem("chatnest_token", res.access_token);
      set({ user: res.user, token: res.access_token, isLoading: false });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        "Registration failed";
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  loadUser: async () => {
    const token = localStorage.getItem("chatnest_token");
    if (!token) return;
    set({ isLoading: true });
    try {
      const user = await fetchMe();
      set({ user, token, isLoading: false });
    } catch {
      localStorage.removeItem("chatnest_token");
      set({ user: null, token: null, isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem("chatnest_token");
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
