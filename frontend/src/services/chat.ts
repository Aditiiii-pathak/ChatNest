/* ── Chat / conversation API calls ─────────────────────────────────────────── */

import api from "./api";
import type {
  Conversation,
  ConversationFull,
  PaginatedMessages,
  AssistantReply,
  GlobalSearchResponse,
  ShareResponse,
  ShareStatusResponse,
  PublicSharedConversation,
} from "@/types";

/* ── Conversations ─────────────────────────────────────────────────────────── */

export async function fetchConversations(): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>("/conversations/");
  return data;
}

export async function createConversation(
  title?: string,
): Promise<ConversationFull> {
  const { data } = await api.post<ConversationFull>("/conversations/", {
    title: title ?? "New Conversation",
  });
  return data;
}

export async function fetchMessages(
  conversationId: string,
  page = 1,
  pageSize = 100,
): Promise<PaginatedMessages> {
  const { data } = await api.get<PaginatedMessages>(
    `/conversations/${conversationId}`,
    { params: { page, page_size: pageSize } },
  );
  return data;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await api.delete(`/conversations/${conversationId}`);
}

export async function updateConversation(
  conversationId: string,
  update: { title?: string; is_archived?: boolean },
): Promise<void> {
  await api.patch(`/conversations/${conversationId}`, update);
}

/* ── Messages ──────────────────────────────────────────────────────────────── */

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<AssistantReply> {
  const { data } = await api.post<AssistantReply>("/message/", {
    conversation_id: conversationId,
    content,
  });
  return data;
}

export async function editMessage(
  messageId: string,
  content: string,
): Promise<void> {
  await api.put(`/message/${messageId}/edit`, { content });
}

export async function deleteMessage(messageId: string): Promise<void> {
  await api.delete(`/message/${messageId}`);
}

/* ── Incognito Mode ────────────────────────────────────────────────────────
 * Best-effort wipe of the server-side volatile session. The store is RAM
 * only and TTL-bound, but clearing on demand gives users an explicit
 * "forget this session now" control.
 */
export async function clearIncognitoSession(sessionId: string): Promise<void> {
  await api.delete(`/message/incognito/session/${sessionId}`);
}

/* ── Global search across all conversations ───────────────────────────────
 * Fuses SQL keyword + Qdrant semantic hits into a single ranked list. The
 * backend already scopes results to the authenticated user's own
 * conversations — this client-side call is just a thin wrapper.
 */
export async function searchAll(
  query: string,
  limit = 25,
): Promise<GlobalSearchResponse> {
  const { data } = await api.get<GlobalSearchResponse>("/search/global", {
    params: { q: query, limit },
  });
  return data;
}

/* ── Shared conversation links ────────────────────────────────────────────
 * Owner-scoped CRUD. Public reads go through ``fetchSharedConversation``
 * which uses a bare axios call without auth.
 */
export async function createShare(
  conversationId: string,
): Promise<ShareResponse> {
  const { data } = await api.post<ShareResponse>(
    `/conversations/${conversationId}/share`,
  );
  return data;
}

export async function getShareStatus(
  conversationId: string,
): Promise<ShareStatusResponse> {
  const { data } = await api.get<ShareStatusResponse>(
    `/conversations/${conversationId}/share`,
  );
  return data;
}

export async function revokeShare(conversationId: string): Promise<void> {
  await api.delete(`/conversations/${conversationId}/share`);
}

/* Public, unauthenticated read of a shared conversation. We use the base
 * ``api`` instance only because it already knows the backend URL — the
 * interceptors still attach an Authorization header if a token exists,
 * which the server simply ignores for this route. */
export async function fetchSharedConversation(
  token: string,
): Promise<PublicSharedConversation> {
  const { data } = await api.get<PublicSharedConversation>(
    `/shared/${token}`,
  );
  return data;
}
