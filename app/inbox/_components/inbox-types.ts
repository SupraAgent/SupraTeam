// ── Chat Label Types & Constants ────────────────────────────────

export interface ChatLabel {
  id: string;
  telegram_chat_id: number;
  is_vip: boolean;
  is_archived: boolean;
  is_pinned: boolean;
  is_muted: boolean;
  color_tag: string | null;
  color_tag_color: string | null;
  note: string | null;
  snoozed_until: string | null;
  last_user_message_at: string | null;
  last_contact_message_at: string | null;
}

export const COLOR_TAGS = [
  { key: "hot_lead", label: "Hot Lead", color: "#ef4444" },
  { key: "partner", label: "Partner", color: "#3b82f6" },
  { key: "investor", label: "Investor", color: "#8b5cf6" },
  { key: "vip_client", label: "VIP Client", color: "#f59e0b" },
  { key: "urgent", label: "Urgent", color: "#f97316" },
  { key: "follow_up", label: "Follow Up", color: "#06b6d4" },
] as const;

export function emptyLabel(chatId: number): ChatLabel {
  return {
    id: "", telegram_chat_id: chatId,
    is_vip: false, is_archived: false, is_pinned: false, is_muted: false,
    color_tag: null, color_tag_color: null, note: null,
    snoozed_until: null, last_user_message_at: null, last_contact_message_at: null,
  };
}

// ── Types ──────────────────────────────────────────────────────

export interface ThreadMessage {
  id: string;
  telegram_message_id: number;
  telegram_chat_id: number;
  sender_telegram_id: number;
  sender_name: string;
  sender_username: string | null;
  message_text: string;
  message_type: string;
  reply_to_message_id: number | null;
  sent_at: string;
  is_from_bot: boolean;
  replies: ThreadMessage[];
}

export interface Conversation {
  chat_id: number;
  group_name: string;
  group_type: string;
  tg_group_id: string;
  member_count: number | null;
  message_count: number;
  latest_at: string | null;
  messages: ThreadMessage[];
}

export interface Deal {
  id: string;
  deal_name: string;
  board_type: string;
  stage_id: string | null;
  stage: { name: string; color: string } | null;
  assigned_to: string | null;
  contact: { id: string; name: string } | null;
  value?: number | null;
  probability?: number | null;
  health_score?: number | null;
  ai_summary?: string | null;
}

export interface InboxStatus {
  chat_id: number;
  status: "open" | "snoozed" | "closed";
  assigned_to: string | null;
  snoozed_until: string | null;
  closed_at: string | null;
  updated_at: string;
}

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
}

export type InboxTab = "awaiting_reply" | "mine" | "unassigned" | "open" | "vip" | "archived" | "closed";

// ── Advanced Search Parser ─────────────────────────────────────

export interface SearchFilters {
  text: string;
  fromUsername: string | null;
  hasAttachment: boolean;
  isUnread: boolean;
  isVip: boolean;
}

export function parseSearchFilters(raw: string): SearchFilters {
  let text = raw;
  let fromUsername: string | null = null;
  let hasAttachment = false;
  let isUnread = false;
  let isVip = false;

  const fromMatch = text.match(/from:(\S+)/i);
  if (fromMatch) {
    fromUsername = fromMatch[1].toLowerCase();
    text = text.replace(fromMatch[0], "");
  }
  if (/has:attachment/i.test(text)) {
    hasAttachment = true;
    text = text.replace(/has:attachment/gi, "");
  }
  if (/is:unread/i.test(text)) {
    isUnread = true;
    text = text.replace(/is:unread/gi, "");
  }
  if (/is:vip/i.test(text)) {
    isVip = true;
    text = text.replace(/is:vip/gi, "");
  }

  return { text: text.trim(), fromUsername, hasAttachment, isUnread, isVip };
}
