/* ── Auth API calls ────────────────────────────────────────────────────────── */

import api from "./api";
import type { TokenResponse, User } from "@/types";

export async function registerUser(
  email: string,
  password: string,
  display_name?: string,
): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/register", {
    email,
    password,
    display_name: display_name || null,
  });
  return data;
}

export async function loginUser(
  email: string,
  password: string,
): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", {
    email,
    password,
  });
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}
