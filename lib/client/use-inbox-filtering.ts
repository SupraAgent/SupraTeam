"use client";

import * as React from "react";
import type { ChatLabel, Conversation, InboxStatus, ChatUrgency, InboxTab } from "./inbox-types";
import { URGENCY_RANK } from "./inbox-types";

// ── Types ──────────────────────────────────────────────────────

interface SearchFilters {
  text: string;
  fromUsername: string | null;
  hasAttachment: boolean;
  isUnread: boolean;
  isVip: boolean;
}

interface ChatGroupMember {
  telegram_chat_id: number;
}

interface ChatGroup {
  id: string;
  crm_tg_chat_group_members: ChatGroupMember[];
}

// ── Search Parser ──────────────────────────────────────────────

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

// ── Hook Input / Output ────────────────────────────────────────

export interface InboxFilteringInput {
  conversations: Conversation[];
  search: string;
  activeTab: InboxTab;
  statuses: Record<number, InboxStatus>;
  currentUserId: string | null;
  lastSeen: Record<number, string>;
  labels: Record<string, ChatLabel>;
  activeGroupId: string | null;
  chatGroups: ChatGroup[];
  urgency: Record<number, ChatUrgency>;
}

export interface InboxFilteringResult {
  filtered: Conversation[];
  unassignedCount: number;
  mineCount: number;
  awaitingReplyCount: number;
  urgentCount: number;
  vipCount: number;
  archivedCount: number;
}

// ── Hook ───────────────────────────────────────────────────────

export function useInboxFiltering({
  conversations,
  search,
  activeTab,
  statuses,
  currentUserId,
  lastSeen,
  labels,
  activeGroupId,
  chatGroups,
  urgency,
}: InboxFilteringInput): InboxFilteringResult {
  const getLabel = React.useCallback(
    (chatId: number): ChatLabel | undefined => labels[String(chatId)],
    [labels]
  );

  const filtered = React.useMemo(() => {
    let result = conversations;

    // Advanced search — parse filter tokens then apply text search
    const filters = parseSearchFilters(search);
    if (filters.text) {
      const q = filters.text.toLowerCase();
      result = result.filter((c) => {
        const l = getLabel(c.chat_id);
        return (
          c.group_name.toLowerCase().includes(q) ||
          l?.note?.toLowerCase().includes(q) ||
          l?.color_tag?.toLowerCase().includes(q) ||
          c.messages.some((m) =>
            m.message_text?.toLowerCase().includes(q) ||
            m.sender_name.toLowerCase().includes(q)
          )
        );
      });
    }
    if (filters.fromUsername) {
      const uname = filters.fromUsername;
      result = result.filter((c) =>
        c.messages.some((m) => m.sender_username?.toLowerCase() === uname || m.sender_name.toLowerCase().includes(uname))
      );
    }
    if (filters.hasAttachment) {
      result = result.filter((c) =>
        c.messages.some((m) => m.message_type !== "text")
      );
    }
    if (filters.isUnread) {
      result = result.filter((c) => {
        const seenAt = lastSeen[c.chat_id];
        return !seenAt || c.messages.some((m) => m.sent_at > seenAt);
      });
    }
    if (filters.isVip) {
      result = result.filter((c) => getLabel(c.chat_id)?.is_vip);
    }

    // Tab filtering
    if (activeTab === "urgent") {
      result = result.filter((c) => {
        const u = urgency[c.chat_id];
        return u && (URGENCY_RANK[u.level] ?? 0) >= (URGENCY_RANK["high"] ?? 0);
      });
    } else if (activeTab === "awaiting_reply") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        if (s?.status === "closed" || getLabel(c.chat_id)?.is_archived) return false;
        const lastMsg = c.messages[0];
        return lastMsg && !lastMsg.is_from_bot;
      });
    } else if (activeTab === "mine") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        return s?.assigned_to === currentUserId && s?.status !== "closed" && !getLabel(c.chat_id)?.is_archived;
      });
    } else if (activeTab === "unassigned") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        return (!s || !s.assigned_to) && (!s || s.status !== "closed") && !getLabel(c.chat_id)?.is_archived;
      });
    } else if (activeTab === "vip") {
      result = result.filter((c) => getLabel(c.chat_id)?.is_vip && !getLabel(c.chat_id)?.is_archived);
    } else if (activeTab === "archived") {
      result = result.filter((c) => getLabel(c.chat_id)?.is_archived);
    } else if (activeTab === "closed") {
      result = result.filter((c) => statuses[c.chat_id]?.status === "closed");
    } else {
      // "open" — exclude closed and archived unless searching
      if (!search.trim()) {
        result = result.filter((c) => statuses[c.chat_id]?.status !== "closed" && !getLabel(c.chat_id)?.is_archived);
      }
    }

    // Un-snooze: filter out snoozed conversations that haven't expired
    if (activeTab !== "closed" && activeTab !== "archived") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        if (s?.status !== "snoozed") return true;
        return s.snoozed_until ? new Date(s.snoozed_until).getTime() <= Date.now() : true;
      });
    }

    // Group filter: only show chats in the active group
    if (activeGroupId) {
      const activeGroup = chatGroups.find((g) => g.id === activeGroupId);
      if (activeGroup) {
        const memberChatIds = new Set(activeGroup.crm_tg_chat_group_members.map((m) => m.telegram_chat_id));
        result = result.filter((c) => memberChatIds.has(c.chat_id));
      }
    }

    // Sort: pinned > urgency (critical > high) > unread > recency
    result = [...result].sort((a, b) => {
      const aPinned = getLabel(a.chat_id)?.is_pinned ? 1 : 0;
      const bPinned = getLabel(b.chat_id)?.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      // Urgency sort: critical > high > rest
      const aUrg = URGENCY_RANK[urgency[a.chat_id]?.level ?? ""] ?? 0;
      const bUrg = URGENCY_RANK[urgency[b.chat_id]?.level ?? ""] ?? 0;
      if (aUrg !== bUrg) return bUrg - aUrg;
      const aHasUnread = !lastSeen[a.chat_id] || (a.latest_at ? a.latest_at > lastSeen[a.chat_id] : false);
      const bHasUnread = !lastSeen[b.chat_id] || (b.latest_at ? b.latest_at > lastSeen[b.chat_id] : false);
      if (aHasUnread && !bHasUnread) return -1;
      if (!aHasUnread && bHasUnread) return 1;
      return (b.latest_at ?? "").localeCompare(a.latest_at ?? "");
    });

    return result;
  }, [conversations, search, activeTab, statuses, currentUserId, lastSeen, getLabel, labels, activeGroupId, chatGroups, urgency]);

  const unassignedCount = React.useMemo(() => conversations.filter((c) => {
    const s = statuses[c.chat_id];
    return (!s || !s.assigned_to) && (!s || s.status !== "closed");
  }).length, [conversations, statuses]);

  const mineCount = React.useMemo(() => conversations.filter((c) => {
    const s = statuses[c.chat_id];
    return s?.assigned_to === currentUserId && s?.status !== "closed";
  }).length, [conversations, statuses, currentUserId]);

  const awaitingReplyCount = React.useMemo(() => conversations.filter((c) => {
    const s = statuses[c.chat_id];
    if (s?.status === "closed" || getLabel(c.chat_id)?.is_archived) return false;
    const lastMsg = c.messages[0];
    return lastMsg && !lastMsg.is_from_bot;
  }).length, [conversations, statuses, getLabel]);

  const urgentCount = React.useMemo(() => conversations.filter((c) => {
    const u = urgency[c.chat_id];
    return u && (URGENCY_RANK[u.level] ?? 0) >= (URGENCY_RANK["high"] ?? 0);
  }).length, [conversations, urgency]);

  const vipCount = React.useMemo(() =>
    conversations.filter((c) => getLabel(c.chat_id)?.is_vip && !getLabel(c.chat_id)?.is_archived).length,
    [conversations, getLabel]
  );

  const archivedCount = React.useMemo(() =>
    conversations.filter((c) => getLabel(c.chat_id)?.is_archived).length,
    [conversations, getLabel]
  );

  return {
    filtered,
    unassignedCount,
    mineCount,
    awaitingReplyCount,
    urgentCount,
    vipCount,
    archivedCount,
  };
}
