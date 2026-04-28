/* ── ChatNest shared types ─────────────────────────────────────────────────── */

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Conversation {
  conversation_id: string;
  title: string | null;
  last_message_preview: string | null;
  updated_at: string;
}

export interface ConversationFull {
  id: string;
  user_id: string;
  title: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  token_count: number;
  sequence_number: number;
  created_at: string;
}

export interface PaginatedMessages {
  messages: Message[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface AssistantReply {
  user_message: Message;
  assistant_message: Message;
}

export interface StreamChunk {
  content?: string;
  done?: boolean;
  message_id?: string;
  incognito?: boolean;
  emotion?: string;
  mode?: BehaviorMode;
  session_id?: string | null;
  error?: string;
  /* Auto-title flow — emitted once, after the first assistant turn of a
   * freshly-created conversation, so the sidebar can update in place
   * without a full refetch. */
  title_updated?: boolean;
  conversation_id?: string;
  title?: string;
}

/* ── Behavior modes ─────────────────────────────────────────────────────────
 * Modes shape the assistant's tone *and* generation config (temperature,
 * max output length). They apply equally to persistent and incognito chats.
 *
 * Keep in sync with ``app/services/behavior_service.py`` and
 * ``BehaviorMode`` in ``app/schemas/message.py``.
 */
export type BehaviorMode =
  | "default"
  | "buddy"
  | "emotional"
  | "concise"
  | "expert"
  | "creative"
  | "coding"
  | "study";

/**
 * A message kept only in the browser's RAM while Incognito Mode is on.
 * It intentionally omits persistent DB fields (no server id, no sequence
 * number, no conversation id) so it can't accidentally be treated as a
 * saved message.
 */
export interface IncognitoMessage {
  local_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  emotion?: string;
}

export interface SemanticSearchResult {
  message_id: string;
  conversation_id: string;
  content: string;
  role: string;
  similarity_score: number;
}

export interface KeywordSearchResult {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sequence_number: number;
}

/* ── Global search ─────────────────────────────────────────────────────────
 * Cross-conversation hits merged from keyword (SQL ILIKE) and semantic
 * (Qdrant) branches. ``match_type === "both"`` means both strategies
 * surfaced the row — shown first in the palette.
 */
export type SearchMatchType = "keyword" | "semantic" | "both";

export interface GlobalSearchHit {
  conversation_id: string;
  conversation_title: string | null;
  message_id: string;
  role: string;
  content: string;
  snippet: string;
  match_type: SearchMatchType;
  score: number;
  sequence_number: number | null;
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  hits: GlobalSearchHit[];
}

/* ── Shared conversation links ──────────────────────────────────────────── */

export interface ShareResponse {
  conversation_id: string;
  token: string;
  created_at: string;
  url: string;
}

export interface ShareStatusResponse {
  conversation_id: string;
  is_shared: boolean;
  token?: string | null;
  url?: string | null;
  created_at?: string | null;
}

export interface PublicSharedMessage {
  role: string;
  content: string;
  sequence_number: number;
  created_at: string;
}

export interface PublicSharedConversation {
  title: string | null;
  created_at: string;
  updated_at: string;
  messages: PublicSharedMessage[];
}
