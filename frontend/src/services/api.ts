/* ── Central Axios instance with JWT interceptor ──────────────────────────── */

import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

/* ── Request interceptor — attach JWT ──────────────────────────────────────── */
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("chatnest_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/* ── Response interceptor — handle 401 globally ────────────────────────────── */
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("chatnest_token");
      // Only redirect if not already on login/register
      if (
        !window.location.pathname.includes("/login") &&
        !window.location.pathname.includes("/register")
      ) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export { API_BASE };
export default api;
