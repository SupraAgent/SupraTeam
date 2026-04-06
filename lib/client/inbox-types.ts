/** Shared types for inbox components and hooks */

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

export interface InboxStatus {
  chat_id: number;
  status: "open" | "snoozed" | "closed";
  assigned_to: string | null;
  snoozed_until: string | null;
  closed_at: string | null;
  updated_at: string;
}

export interface ChatUrgency {
  level: string;
  category: string | null;
  summary: string | null;
  count: number;
}

export type InboxTab = "awaiting_reply" | "urgent" | "mine" | "unassigned" | "open" | "vip" | "archived" | "closed";

export const URGENCY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
