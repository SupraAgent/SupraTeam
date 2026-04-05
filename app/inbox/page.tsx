"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  ExternalLink,
  Reply,
  ChevronDown,
  ChevronRight,
  Inbox as InboxIcon,
  RefreshCw,
  Send,
  UserPlus,
  AlarmClock,
  X,
  CheckCheck,
  Zap,
  Bot,
  User as UserIcon,
  Star,
  Pin,
  Archive,
  StickyNote,
  Sparkles,
  MessageSquare,
  Keyboard,
  CalendarClock,
  Hourglass,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { NukeProgressModal } from "@/components/telegram/nuke-progress-modal";
import { useNukeMessages } from "@/lib/client/use-nuke-messages";
import { useNukeGroups } from "@/lib/client/use-nuke-groups";
import { useTelegramAdminGroups } from "@/lib/client/use-telegram-admin-groups";
import { useTelegram } from "@/lib/client/telegram-context";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { DealContextSidebar } from "@/components/inbox/deal-context-sidebar";
import {
  TgChatGroupPanel,
  useTgChatGroups,
} from "@/components/inbox/tg-chat-group-panel";

import type {
  ChatLabel,
  Conversation,
  Deal,
  InboxStatus,
  CannedResponse,
  InboxTab,
  ThreadMessage,
} from "./_components/inbox-types";
import { COLOR_TAGS, emptyLabel, parseSearchFilters } from "./_components/inbox-types";
import { useInboxKeyboardShortcuts } from "./_components/use-inbox-keyboard";
import { MessageBubble } from "./_components/message-bubble";
import { ConversationListItem } from "./_components/conversation-list-item";
import { InboxContextMenu, NoteModal, ShortcutHelpModal } from "./_components/inbox-modals";


// ── Infinite Scroll Sentinel ──────────────────────────────────

function InboxLoadMore({ loading, onVisible }: { loading: boolean; onVisible: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          onVisible();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, onVisible]);

  return (
    <div ref={ref} className="p-3 flex justify-center">
      {loading && <span className="text-xs text-muted-foreground/50">Loading...</span>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function InboxPage() {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [deals, setDeals] = React.useState<Record<number, Deal[]>>({});
  const [statuses, setStatuses] = React.useState<Record<number, InboxStatus>>({});
  const [cannedResponses, setCannedResponses] = React.useState<CannedResponse[]>([]);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<{ id: string; display_name: string }[]>([]);
  const [lastSeen, setLastSeen] = React.useState<Record<number, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selectedChat, setSelectedChat] = React.useState<number | null>(null);
  const [showDealSidebar, setShowDealSidebar] = React.useState(true);
  const [expandedThreads, setExpandedThreads] = React.useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<InboxTab>("awaiting_reply");
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  // Chat labels (VIP, tags, notes, archive, pin, mute)
  const [labels, setLabels] = React.useState<Record<string, ChatLabel>>({});
  const [contextMenu, setContextMenu] = React.useState<{
    x: number; y: number; chatId: number; groupName: string; submenu?: "tag" | "snooze";
  } | null>(null);
  const [noteModal, setNoteModal] = React.useState<{ chatId: number; groupName: string } | null>(null);
  const [noteText, setNoteText] = React.useState("");

  // Chat groups (drag-to-group + filtering)
  const chatGroups = useTgChatGroups();
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(null);

  // Nuke state
  const [nukeTarget, setNukeTarget] = React.useState<{ chatId: number; name: string; type: "messages" | "groups" } | null>(null);
  const nukeMessages = useNukeMessages();
  const nukeGroups = useNukeGroups();
  const { groups: adminGroups } = useTelegramAdminGroups();
  const { service: tgService, status: tgStatus } = useTelegram();

  // Reply state
  const [replyText, setReplyText] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<ThreadMessage | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sendAs, setSendAs] = React.useState<"user" | "bot">("bot");

  // Canned response picker
  const [showCanned, setShowCanned] = React.useState(false);
  const [cannedSearch, setCannedSearch] = React.useState("");
  const [cannedIndex, setCannedIndex] = React.useState(0);
  const cannedListRef = React.useRef<HTMLDivElement>(null);
  const replyTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const statusesRef = React.useRef(statuses);
  statusesRef.current = statuses;
  const conversationsRef = React.useRef(conversations);
  conversationsRef.current = conversations;
  const selectedChatRef = React.useRef(selectedChat);
  selectedChatRef.current = selectedChat;
  const currentUserIdRef = React.useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const filteredRef = React.useRef<Conversation[]>([]);

  // Snooze picker
  const [showSnooze, setShowSnooze] = React.useState<number | null>(null);
  const snoozeRef = React.useRef<HTMLDivElement>(null);

  // Bot filter
  const [bots, setBots] = React.useState<{ id: string; label: string }[]>([]);
  const [selectedBotId, setSelectedBotId] = React.useState<string>("");

  // Hydrate selectedBotId from localStorage after mount
  React.useEffect(() => {
    const stored = localStorage.getItem("inbox_bot_filter");
    if (stored) setSelectedBotId(stored);
  }, []);

  // Keyboard shortcut help modal
  const [showShortcutHelp, setShowShortcutHelp] = React.useState(false);
  // Highlighted index for keyboard nav in conversation list
  const [highlightedIndex, setHighlightedIndex] = React.useState<number>(-1);
  // AI state
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiSummarizing, setAiSummarizing] = React.useState(false);
  const [aiSuggesting, setAiSuggesting] = React.useState(false);
  // Schedule send
  const [showScheduleMenu, setShowScheduleMenu] = React.useState(false);
  const scheduleRef = React.useRef<HTMLDivElement>(null);
  // Search input ref for keyboard shortcut focus
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch("/api/bots").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.bots) setBots(d.bots.map((b: { id: string; label: string }) => ({ id: b.id, label: b.label })));
    }).catch(() => {});
  }, []);

  // ── Data Fetching ──────────────────────────────────────────

  const fetchInbox = React.useCallback(async () => {
    try {
      const params = selectedBotId ? `?bot_id=${selectedBotId}` : "";
      const results = await Promise.allSettled([
        fetch(`/api/inbox${params}`),
        fetch("/api/inbox/status"),
        fetch("/api/inbox/canned"),
        fetch("/api/inbox/seen"),
        fetch("/api/chat-labels"),
      ]);

      const [inboxRes, statusRes, cannedRes, seenRes, labelsRes] = results;

      if (inboxRes.status === "fulfilled" && inboxRes.value.ok) {
        const data = await inboxRes.value.json();
        setConversations((data.conversations ?? []).map((c: Conversation) => ({
          ...c,
          messages: c.messages.filter((m: ThreadMessage) => !String(m.id).startsWith("optimistic-")),
        })));
        setDeals(data.deals ?? {});
        setHasMore(data.hasMore ?? false);
        setNextCursor(data.nextCursor ?? null);
      }
      if (statusRes.status === "fulfilled" && statusRes.value.ok) {
        const data = await statusRes.value.json();
        setStatuses(data.statuses ?? {});
      }
      if (cannedRes.status === "fulfilled" && cannedRes.value.ok) {
        const data = await cannedRes.value.json();
        setCannedResponses(data.responses ?? []);
      }
      if (seenRes.status === "fulfilled" && seenRes.value.ok) {
        const data = await seenRes.value.json();
        setLastSeen(data.seen ?? {});
      }
      if (labelsRes.status === "fulfilled" && labelsRes.value.ok) {
        const data = await labelsRes.value.json();
        setLabels(data.data ?? {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBotId]);

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (selectedBotId) params.set("bot_id", selectedBotId);
      params.set("before", nextCursor);
      const res = await fetch(`/api/inbox?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const newConvs = (data.conversations ?? []).map((c: Conversation) => ({
          ...c,
          messages: c.messages.filter((m: ThreadMessage) => !String(m.id).startsWith("optimistic-")),
        }));
        setConversations((prev) => [...prev, ...newConvs]);
        setDeals((prev) => ({ ...prev, ...(data.deals ?? {}) }));
        setHasMore(data.hasMore ?? false);
        setNextCursor(data.nextCursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor, selectedBotId]);

  // Get current user ID + team members
  React.useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
    // Fetch team members for assignment dropdown
    fetch("/api/team").then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(data.members ?? []);
      }
    });
  }, []);

  React.useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // Stable ref for fetchInbox so realtime subscription doesn't churn on bot filter change
  const fetchInboxRef = React.useRef(fetchInbox);
  fetchInboxRef.current = fetchInbox;

  // Supabase realtime: subscribe to new group messages (debounced)
  React.useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("inbox-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tg_group_messages" },
        (payload) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            await fetchInboxRef.current();
            const newMsg = payload.new as Record<string, unknown>;
            const chatId = newMsg?.telegram_chat_id as number | undefined;
            if (!chatId) return;

            // Read current status for side-effect decisions
            const currentStatus = statusesRef.current[chatId];

            // Auto-reopen closed conversations
            if (currentStatus?.status === "closed") {
              setStatuses((prev) => ({
                ...prev,
                [chatId]: {
                  ...(prev[chatId] ?? { chat_id: chatId, assigned_to: null, snoozed_until: null, updated_at: new Date().toISOString() }),
                  status: "open" as const,
                  closed_at: null,
                } as InboxStatus,
              }));
              fetch("/api/inbox/status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, status: "open" }),
              }).catch(() => fetchInboxRef.current());
            }
            if (!currentStatus?.assigned_to) {
              fetch("/api/inbox/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_text: newMsg.message_text ?? "",
                  sender_telegram_id: newMsg.sender_telegram_id ?? 0,
                }),
              }).then(async (res) => {
                if (res.ok) {
                  const data = await res.json();
                  if (data.assigned) {
                    setStatuses((p) => ({
                      ...p,
                      [chatId]: {
                        ...(p[chatId] ?? { chat_id: chatId, status: "open" as const, snoozed_until: null, closed_at: null, updated_at: new Date().toISOString() }),
                        assigned_to: data.user_id,
                      } as InboxStatus,
                    }));
                  }
                }
              }).catch(() => fetchInboxRef.current());
            }
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────

  function handleRefresh() {
    setRefreshing(true);
    fetchInbox();
  }

  function handleSelectChat(chatId: number) {
    setSelectedChat(chatId);
    // Mark as seen (fire-and-forget, also update local state immediately)
    setLastSeen((prev) => ({ ...prev, [chatId]: new Date().toISOString() }));
    fetch("/api/inbox/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
    });
  }

  function toggleThread(messageId: number) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  function handleEmojiSelect(emoji: string) {
    setReplyText((prev) => prev + emoji);
    replyTextareaRef.current?.focus();
  }

  async function handleSendReply() {
    const chatId = selectedChatRef.current;
    if (!replyText.trim() || !chatId) return;
    setSending(true);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message: replyText.trim(),
          reply_to_message_id: replyTo?.telegram_message_id ?? undefined,
          send_as: sendAs,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Sent via ${data.via === "user_client" ? "your account" : "bot"}`);
        const sentText = replyText.trim();
        const sentReplyTo = replyTo?.telegram_message_id ?? null;
        setReplyText("");
        setReplyTo(null);
        // Reset textarea height
        if (replyTextareaRef.current) replyTextareaRef.current.style.height = "auto";
        // Optimistic: inject sent message into local state immediately
        setConversations((prev) =>
          prev.map((c) => {
            if (c.chat_id !== chatId) return c;
            const optimisticMsg: ThreadMessage = {
              id: `optimistic-${Date.now()}`,
              telegram_message_id: -Date.now(),
              telegram_chat_id: chatId,
              sender_telegram_id: 0,
              sender_name: "You",
              sender_username: null,
              message_text: sentText,
              message_type: "text",
              reply_to_message_id: sentReplyTo,
              sent_at: new Date().toISOString(),
              is_from_bot: sendAs === "bot",
              replies: [],
            };
            return {
              ...c,
              latest_at: optimisticMsg.sent_at,
              message_count: c.message_count + 1,
              messages: [{ ...optimisticMsg, replies: [] as ThreadMessage[] }, ...c.messages],
            };
          })
        );
        // Track last user message time for response-time analytics
        const conv = conversationsRef.current.find((c) => c.chat_id === chatId);
        if (conv) updateLabel(chatId, conv.group_name, { last_user_message_at: new Date().toISOString() });
        // Still refresh after delay to get the real message with proper IDs
        setTimeout(() => fetchInbox(), 3000);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to send");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(chatId: number, status: string, snoozedUntil?: string) {
    try {
      const res = await fetch("/api/inbox/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          status,
          snoozed_until: snoozedUntil ?? null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatuses((prev) => ({ ...prev, [chatId]: data.status }));
        if (status === "closed") toast.success("Conversation closed");
        if (status === "snoozed") toast.success("Snoozed");
        if (status === "open") toast.success("Reopened");
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Failed to update status");
      }
    } catch {
      toast.error("Network error — could not update status");
    }
    setShowSnooze(null);
  }

  async function handleAssign(chatId: number, userId: string | null) {
    try {
      const res = await fetch("/api/inbox/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, assigned_to: userId, status: "open" }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatuses((prev) => ({ ...prev, [chatId]: data.status }));
        toast.success(userId ? "Assigned" : "Unassigned");
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Failed to assign");
      }
    } catch {
      toast.error("Network error — could not assign");
    }
  }

  // ── Chat Label Mutations ────────────────────────────────────

  function getLabel(chatId: number): ChatLabel | undefined {
    return labels[String(chatId)];
  }

  async function updateLabel(chatId: number, groupName: string, updates: Partial<ChatLabel>) {
    const key = String(chatId);
    const prev = labels[key];
    setLabels((p) => ({
      ...p,
      [key]: { ...emptyLabel(chatId), ...p[key], ...updates },
    }));
    try {
      const res = await fetch("/api/chat-labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_chat_id: chatId, chat_title: groupName, ...updates }),
      });
      if (!res.ok) {
        setLabels((p) => prev ? { ...p, [key]: prev } : (() => { const next = { ...p }; delete next[key]; return next; })());
      }
    } catch {
      setLabels((p) => prev ? { ...p, [key]: prev } : (() => { const next = { ...p }; delete next[key]; return next; })());
    }
  }

  function toggleLabel(chatId: number, groupName: string, field: "is_vip" | "is_archived" | "is_pinned" | "is_muted") {
    const current = getLabel(chatId);
    updateLabel(chatId, groupName, { [field]: !(current?.[field] ?? false) } as Partial<ChatLabel>);
  }

  function setColorTag(chatId: number, groupName: string, tag: string | null, color: string | null) {
    updateLabel(chatId, groupName, { color_tag: tag, color_tag_color: color });
  }

  function saveNote(chatId: number, groupName: string, text: string) {
    updateLabel(chatId, groupName, { note: text || null });
  }

  function handleContextMenu(e: React.MouseEvent, chatId: number, groupName: string) {
    e.preventDefault();
    const menuW = 200;
    const menuH = 300;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setContextMenu({ x, y, chatId, groupName });
  }



  function insertCannedResponse(response: CannedResponse) {
    // Render merge vars from linked deals
    let text = response.body;
    if (selectedChat) {
      const chatDeals = deals[selectedChat];
      if (chatDeals && chatDeals.length > 0) {
        const deal = chatDeals[0];
        text = text
          .replace(/\{\{deal_name\}\}/g, () => deal.deal_name ?? "")
          .replace(/\{\{contact_name\}\}/g, () => deal.contact?.name ?? "")
          .replace(/\{\{stage\}\}/g, () => (deal.stage as { name: string } | null)?.name ?? "")
          .replace(/\{\{board_type\}\}/g, () => deal.board_type ?? "");
      }
    }
    // Strip any remaining unresolved merge vars (e.g. no linked deal)
    text = text.replace(/\{\{[^}]+\}\}/g, "");
    setReplyText(text);
    setShowCanned(false);
    setCannedSearch("");
    // Increment usage count (fire-and-forget)
    fetch("/api/inbox/canned", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: response.id, increment_usage: true }),
    });
  }

  // ── Filtering ──────────────────────────────────────────────

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
    if (activeTab === "awaiting_reply") {
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
      const activeGroup = chatGroups.groups.find((g) => g.id === activeGroupId);
      if (activeGroup) {
        const memberChatIds = new Set(activeGroup.crm_tg_chat_group_members.map((m) => m.telegram_chat_id));
        result = result.filter((c) => memberChatIds.has(c.chat_id));
      }
    }

    // Sort: pinned first, then unread, then by time
    result = [...result].sort((a, b) => {
      const aPinned = getLabel(a.chat_id)?.is_pinned ? 1 : 0;
      const bPinned = getLabel(b.chat_id)?.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aHasUnread = !lastSeen[a.chat_id] || (a.latest_at ? a.latest_at > lastSeen[a.chat_id] : false);
      const bHasUnread = !lastSeen[b.chat_id] || (b.latest_at ? b.latest_at > lastSeen[b.chat_id] : false);
      if (aHasUnread && !bHasUnread) return -1;
      if (!aHasUnread && bHasUnread) return 1;
      return (b.latest_at ?? "").localeCompare(a.latest_at ?? "");
    });

    return result;
  }, [conversations, search, activeTab, statuses, currentUserId, lastSeen, labels, activeGroupId, chatGroups.groups]);
  filteredRef.current = filtered;

  const { unassignedCount, mineCount, awaitingReplyCount, vipCount, archivedCount } = React.useMemo(() => {
    let unassigned = 0;
    let mine = 0;
    let awaiting = 0;
    let vip = 0;
    let archived = 0;
    for (const c of conversations) {
      const s = statuses[c.chat_id];
      const lbl = getLabel(c.chat_id);
      const isClosed = s?.status === "closed";
      const isArchived = !!lbl?.is_archived;

      if ((!s || !s.assigned_to) && !isClosed) unassigned++;
      if (s?.assigned_to === currentUserId && !isClosed) mine++;
      if (!isClosed && !isArchived) {
        const lastMsg = c.messages[0];
        if (lastMsg && !lastMsg.is_from_bot) awaiting++;
      }
      if (lbl?.is_vip && !isArchived) vip++;
      if (isArchived) archived++;
    }
    return { unassignedCount: unassigned, mineCount: mine, awaitingReplyCount: awaiting, vipCount: vip, archivedCount: archived };
  }, [conversations, statuses, currentUserId, labels]);

  const selectedConversation = selectedChat
    ? conversations.find((c) => c.chat_id === selectedChat)
    : null;

  const filteredCanned = cannedSearch.trim()
    ? cannedResponses.filter((r) =>
        r.title.toLowerCase().includes(cannedSearch.toLowerCase()) ||
        (r.shortcut && r.shortcut.toLowerCase().includes(cannedSearch.toLowerCase()))
      )
    : cannedResponses;

  // Close snooze picker on outside click
  React.useEffect(() => {
    if (showSnooze === null) return;
    function handleClickOutside(e: MouseEvent) {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setShowSnooze(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSnooze]);

  // Handle / trigger in reply input
  React.useEffect(() => {
    if (replyText === "/") {
      setShowCanned(true);
      setCannedSearch("");
      setCannedIndex(0);
    } else if (replyText.startsWith("/") && replyText.length > 1) {
      setCannedSearch(replyText.slice(1));
      setCannedIndex(0);
    } else if (showCanned && !replyText.startsWith("/")) {
      setShowCanned(false);
    }
  }, [replyText, showCanned]);

  // ── AI Actions ──────────────────────────────────────────────

  async function handleAiSummarize() {
    if (!selectedConversation || aiSummarizing) return;
    setAiSummarizing(true);
    setAiSummary(null);
    try {
      const messageContext = selectedConversation.messages
        .slice(0, 30)
        .reverse()
        .map((m) => `${m.sender_name}${m.is_from_bot ? " (bot)" : ""}: ${m.message_text ?? `(${m.message_type})`}`)
        .join("\n");
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Summarize this Telegram conversation concisely (3-5 bullet points). Focus on key topics, decisions, and action items:\n\n${messageContext}`,
          context: `Conversation: ${selectedConversation.group_name}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.reply ?? data.message ?? "No summary generated.");
      } else {
        toast.error("Failed to generate summary");
      }
    } catch {
      toast.error("Network error generating summary");
    } finally {
      setAiSummarizing(false);
    }
  }

  async function handleAiSuggestReply() {
    if (!selectedConversation || aiSuggesting) return;
    setAiSuggesting(true);
    try {
      const messageContext = selectedConversation.messages
        .slice(0, 15)
        .reverse()
        .map((m) => `${m.sender_name}${m.is_from_bot ? " (bot)" : ""}: ${m.message_text ?? `(${m.message_type})`}`)
        .join("\n");
      const dealContext = (deals[selectedConversation.chat_id] ?? [])
        .map((d) => `Deal: ${d.deal_name} (${d.stage?.name ?? "no stage"})`)
        .join(", ");
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Based on this conversation, suggest a professional reply message. Just provide the reply text, no explanation.\n\nConversation in "${selectedConversation.group_name}":\n${messageContext}${dealContext ? `\n\nDeal context: ${dealContext}` : ""}`,
          context: `Telegram CRM reply suggestion`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const suggestion = data.reply ?? data.message ?? "";
        if (suggestion) {
          setReplyText(suggestion);
          replyTextareaRef.current?.focus();
          toast.success("Reply suggestion inserted");
        }
      } else {
        toast.error("Failed to generate suggestion");
      }
    } catch {
      toast.error("Network error generating suggestion");
    } finally {
      setAiSuggesting(false);
    }
  }

  // ── Schedule Send ──────────────────────────────────────────

  async function handleScheduleSend(sendAt: Date) {
    if (!replyText.trim() || !selectedChat) return;
    setShowScheduleMenu(false);
    try {
      const res = await fetch("/api/scheduled-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: selectedChat,
          text: replyText.trim(),
          send_at: sendAt.toISOString(),
          reply_to_message_id: replyTo?.telegram_message_id ?? undefined,
          send_as: sendAs,
        }),
      });
      if (res.ok) {
        toast.success(`Scheduled for ${sendAt.toLocaleString()}`);
        setReplyText("");
        setReplyTo(null);
        if (replyTextareaRef.current) replyTextareaRef.current.style.height = "auto";
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Failed to schedule message");
      }
    } catch {
      toast.error("Network error scheduling message");
    }
  }

  // Close schedule menu on outside click
  React.useEffect(() => {
    if (!showScheduleMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (scheduleRef.current && !scheduleRef.current.contains(e.target as Node)) {
        setShowScheduleMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showScheduleMenu]);

  // ── Keyboard Shortcuts ─────────────────────────────────────

  // State refs for keyboard shortcut hook
  const highlightedIndexRef = React.useRef(highlightedIndex);
  highlightedIndexRef.current = highlightedIndex;
  const showShortcutHelpRef = React.useRef(showShortcutHelp);
  showShortcutHelpRef.current = showShortcutHelp;
  const showScheduleMenuRef = React.useRef(showScheduleMenu);
  showScheduleMenuRef.current = showScheduleMenu;
  const showCannedRef = React.useRef(showCanned);
  showCannedRef.current = showCanned;
  const aiSummaryRef = React.useRef(aiSummary);
  aiSummaryRef.current = aiSummary;

  // ── Keyboard Shortcuts (extracted hook) ────────���────────────
  useInboxKeyboardShortcuts(
    {
      conversations: conversationsRef,
      filtered: filteredRef,
      selectedChat: selectedChatRef,
      currentUserId: currentUserIdRef,
      highlightedIndex: highlightedIndexRef,
      showShortcutHelp: showShortcutHelpRef,
      showScheduleMenu: showScheduleMenuRef,
      showCanned: showCannedRef,
      aiSummary: aiSummaryRef,
      replyTextarea: replyTextareaRef,
      searchInput: searchInputRef,
    },
    {
      setShowShortcutHelp,
      setShowScheduleMenu,
      setShowCanned,
      setAiSummary,
      setSelectedChat,
      setHighlightedIndex,
      handleAssign,
      handleStatusChange,
      toggleLabel,
      handleSelectChat,
    }
  );

  // Sync highlighted index with selected chat
  React.useEffect(() => {
    if (selectedChat) {
      const idx = filtered.findIndex((c) => c.chat_id === selectedChat);
      if (idx >= 0) setHighlightedIndex(idx);
    }
  }, [selectedChat, filtered]);

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-[60vh] rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
            Manage Telegram conversations across CRM-linked groups.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const now = new Date().toISOString();
              const updates: Record<number, string> = {};
              for (const c of filtered) {
                updates[c.chat_id] = now;
              }
              setLastSeen((prev) => ({ ...prev, ...updates }));
              // Batch requests in chunks of 10 to avoid unbounded parallel fetches
              const chatIds = filtered.map((c) => c.chat_id);
              const CHUNK_SIZE = 10;
              for (let i = 0; i < chatIds.length; i += CHUNK_SIZE) {
                const chunk = chatIds.slice(i, i + CHUNK_SIZE);
                await Promise.all(
                  chunk.map((chatId) =>
                    fetch("/api/inbox/seen", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ chat_id: chatId }),
                    }).catch(() => {})
                  )
                );
              }
              toast.success("All marked as read");
            }}
            title="Mark all as read"
          >
            <CheckCheck className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mark all read</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowShortcutHelp(true)}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs + Search + Bot Filter */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {([
            { key: "awaiting_reply" as InboxTab, label: "Awaiting", count: awaitingReplyCount, icon: "hourglass" as const },
            { key: "mine" as InboxTab, label: "Mine", count: mineCount },
            { key: "unassigned" as InboxTab, label: "Unassigned", count: unassignedCount },
            { key: "open" as InboxTab, label: "Open" },
            { key: "vip" as InboxTab, label: "VIP", count: vipCount },
            { key: "archived" as InboxTab, label: "Archived", count: archivedCount },
            { key: "closed" as InboxTab, label: "Closed" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? tab.key === "vip" ? "bg-amber-500/20 text-amber-400"
                  : tab.key === "awaiting_reply" ? "bg-orange-500/20 text-orange-400"
                  : "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {tab.key === "vip" && <Star className="inline h-3 w-3 mr-0.5" />}
              {tab.key === "awaiting_reply" && <Hourglass className="inline h-3 w-3 mr-0.5" />}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
                  tab.key === "unassigned" ? "bg-amber-500/20 text-amber-400" :
                  tab.key === "vip" ? "bg-amber-500/20 text-amber-400" :
                  tab.key === "awaiting_reply" ? "bg-orange-500/20 text-orange-400" : "bg-white/10"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search... (from: has: is:)"
            className="pl-8 h-8 text-xs"
          />
        </div>
        {bots.length > 1 && (
          <select
            value={selectedBotId}
            onChange={(e) => {
              setSelectedBotId(e.target.value);
              localStorage.setItem("inbox_bot_filter", e.target.value);
              setLoading(true);
            }}
            className="h-8 rounded-lg border border-white/10 bg-transparent px-2 text-xs text-foreground"
          >
            <option value="">All Bots</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Main layout */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {search ? "No conversations match your search." :
             activeTab === "awaiting_reply" ? "No conversations awaiting your reply." :
             activeTab === "mine" ? "No conversations assigned to you." :
             activeTab === "unassigned" ? "All conversations are assigned." :
             activeTab === "vip" ? "No VIP conversations. Right-click a conversation to mark as VIP." :
             activeTab === "archived" ? "No archived conversations." :
             activeTab === "closed" ? "No closed conversations." :
             "No messages yet."}
          </p>
        </div>
      ) : (
        <div className={cn("grid grid-cols-1 gap-4 min-h-[60vh]", showDealSidebar && selectedChat && (deals[selectedChat] ?? []).length > 0 ? "lg:grid-cols-[320px_1fr_260px]" : "lg:grid-cols-[320px_1fr]")}>
          {/* Left column: Conversation list + Chat groups */}
          <div className="flex flex-col gap-2 min-h-0">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex-1">
            <div className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto thin-scroll">
              {filtered.map((conv, convIndex) => (
                <ConversationListItem
                  key={conv.chat_id}
                  conv={conv}
                  convIndex={convIndex}
                  chatDeals={deals[conv.chat_id] ?? []}
                  isSelected={selectedChat === conv.chat_id}
                  highlightedIndex={highlightedIndex}
                  status={statuses[conv.chat_id]}
                  label={getLabel(conv.chat_id)}
                  teamMembers={teamMembers}
                  lastSeen={lastSeen}
                  activeTab={activeTab}
                  onSelect={handleSelectChat}
                  onContextMenu={handleContextMenu}
                />
              ))}
              {hasMore && (
                <InboxLoadMore loading={loadingMore} onVisible={loadMore} />
              )}
            </div>
          </div>

          {/* Chat Groups — compact drop targets + filter */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2 max-h-[25vh] overflow-y-auto thin-scroll shrink-0">
            <TgChatGroupPanel
              groups={chatGroups.groups}
              loading={chatGroups.loading}
              activeGroupId={activeGroupId}
              onSelectGroup={setActiveGroupId}
              onCreateGroup={chatGroups.createGroup}
              onDeleteGroup={(id) => { if (activeGroupId === id) setActiveGroupId(null); chatGroups.deleteGroup(id); }}
              onRenameGroup={chatGroups.renameGroup}
              onToggleCollapse={chatGroups.toggleCollapse}
              onDropChat={(groupId, data) => chatGroups.addChatToGroup(groupId, data.chatId, data.chatTitle)}
              onRemoveChat={chatGroups.removeChatFromGroup}
              onSelectChat={(chatId) => setSelectedChat(chatId)}
            />
          </div>
          </div>

          {/* Message detail + reply */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col">
            {selectedConversation ? (() => {
              const selLabel = getLabel(selectedConversation.chat_id);
              const selChatId = selectedConversation.chat_id;
              const selGroupName = selectedConversation.group_name;
              const selColorTag = selLabel?.color_tag ? COLOR_TAGS.find((t) => t.key === selLabel.color_tag) : null;
              const selTagColor = selColorTag?.color || selLabel?.color_tag_color;
              return (
              <>
                {/* Header with actions */}
                <div className="border-b border-white/5 px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {selLabel?.is_vip && <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                      <h2 className={cn("text-sm font-medium truncate", selLabel?.is_vip ? "text-amber-200" : "text-foreground")}>
                        {selGroupName}
                      </h2>
                      {selColorTag && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0" style={{ backgroundColor: `${selTagColor}20`, color: selTagColor || undefined }}>
                          {selColorTag.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Label actions */}
                      <button
                        onClick={() => toggleLabel(selChatId, selGroupName, "is_vip")}
                        className={cn("h-7 w-7 flex items-center justify-center rounded-md transition-colors",
                          selLabel?.is_vip ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                        title={selLabel?.is_vip ? "Remove VIP" : "Mark VIP"}
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleLabel(selChatId, selGroupName, "is_pinned")}
                        className={cn("h-7 w-7 flex items-center justify-center rounded-md transition-colors",
                          selLabel?.is_pinned ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                        title={selLabel?.is_pinned ? "Unpin" : "Pin"}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setNoteModal({ chatId: selChatId, groupName: selGroupName });
                          setNoteText(selLabel?.note || "");
                        }}
                        className={cn("h-7 w-7 flex items-center justify-center rounded-md transition-colors",
                          selLabel?.note ? "text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                        title="Notes"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleLabel(selChatId, selGroupName, "is_archived")}
                        className={cn("h-7 w-7 flex items-center justify-center rounded-md transition-colors",
                          selLabel?.is_archived ? "text-foreground bg-white/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                        title={selLabel?.is_archived ? "Unarchive" : "Archive"}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <div className="w-px h-5 bg-white/10 mx-0.5" />
                      {/* Assign to me (one-click) */}
                      {currentUserId && statuses[selChatId]?.assigned_to !== currentUserId && (
                        <button
                          onClick={() => handleAssign(selChatId, currentUserId)}
                          className="h-7 rounded-md bg-white/5 border border-white/10 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 px-2 flex items-center gap-1 transition-colors"
                          title="Assign to me"
                        >
                          <UserPlus className="h-3 w-3" />
                          <span>Me</span>
                        </button>
                      )}
                      {/* Assign dropdown */}
                      <select
                        value={statuses[selChatId]?.assigned_to ?? ""}
                        onChange={(e) => handleAssign(selChatId, e.target.value || null)}
                        className="h-7 rounded-md bg-white/5 border border-white/10 text-[10px] text-muted-foreground px-1.5 cursor-pointer"
                        title="Assign conversation"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id}>{m.display_name}</option>
                        ))}
                      </select>

                      {/* Snooze */}
                      <div className="relative" ref={snoozeRef}>
                        <button
                          onClick={() => setShowSnooze(showSnooze === selChatId ? null : selChatId)}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Snooze"
                        >
                          <AlarmClock className="h-3.5 w-3.5" />
                        </button>
                        {showSnooze === selChatId && (
                          <div className="absolute right-0 top-8 z-10 rounded-lg border border-white/10 bg-[hsl(var(--background))] p-2 shadow-xl min-w-[140px]">
                            {[
                              { label: "1 hour", hours: 1 },
                              { label: "4 hours", hours: 4 },
                              { label: "Tomorrow 9am", hours: -1 },
                              { label: "1 day", hours: 24 },
                              { label: "3 days", hours: 72 },
                              { label: "1 week", hours: 168 },
                            ].map((opt) => {
                              const until = opt.hours === -1
                                ? (() => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + 1);
                                    d.setHours(9, 0, 0, 0);
                                    return d.toISOString();
                                  })()
                                : new Date(Date.now() + opt.hours * 3600000).toISOString();
                              return (
                                <button
                                  key={opt.label}
                                  onClick={() => handleStatusChange(selChatId, "snoozed", until)}
                                  className="block w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-white/5"
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Close / Reopen */}
                      {statuses[selChatId]?.status === "closed" ? (
                        <button
                          onClick={() => handleStatusChange(selChatId, "open")}
                          className="h-7 px-2 flex items-center gap-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" /> Reopen
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(selChatId, "closed")}
                          className="h-7 px-2 flex items-center gap-1 rounded-md text-[10px] text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Close conversation"
                        >
                          <CheckCheck className="h-3 w-3" /> Close
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Linked deals */}
                  <div className="flex items-center gap-2">
                    {(deals[selChatId] ?? []).map((deal) => (
                      <a
                        key={deal.id}
                        href={`/pipeline?highlight=${deal.id}`}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        {deal.deal_name}
                        {deal.stage && (
                          <span className="text-muted-foreground"> ({(deal.stage as { name: string }).name})</span>
                        )}
                      </a>
                    ))}
                    {(deals[selChatId] ?? []).length === 0 && (
                      <span className="text-[10px] text-muted-foreground/40">No linked deals</span>
                    )}
                  </div>
                </div>

                {/* Note banner */}
                {selLabel?.note && (
                  <div
                    className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500/5 border-b border-yellow-500/10 cursor-pointer hover:bg-yellow-500/10 transition-colors"
                    onClick={() => {
                      setNoteModal({ chatId: selChatId, groupName: selGroupName });
                      setNoteText(selLabel?.note || "");
                    }}
                  >
                    <StickyNote className="h-3 w-3 text-yellow-500/60 shrink-0" />
                    <p className="text-[11px] text-yellow-200/80 truncate">{selLabel.note}</p>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 thin-scroll">
                  {selectedConversation.messages.map((msg) => {
                    const hasReplies = msg.replies.length > 0;
                    const isExpanded = expandedThreads.has(msg.telegram_message_id);

                    return (
                      <div key={msg.id} className="group">
                        <MessageBubble
                          msg={msg}
                          onReply={() => setReplyTo(msg)}
                        />

                        {hasReplies && (
                          <div className="ml-6 mt-1">
                            <button
                              onClick={() => toggleThread(msg.telegram_message_id)}
                              className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary"
                            >
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <Reply className="h-3 w-3" />
                              {msg.replies.length} repl{msg.replies.length === 1 ? "y" : "ies"}
                            </button>

                            {isExpanded && (
                              <div className="mt-1 space-y-1 border-l-2 border-white/5 pl-3">
                                {msg.replies.map((reply) => (
                                  <MessageBubble
                                    key={reply.id}
                                    msg={reply}
                                    compact
                                    onReply={() => setReplyTo(reply)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {selectedConversation.messages.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-8">No messages in this group yet.</p>
                  )}
                </div>

                {/* Reply composer */}
                <div className="border-t border-white/5 px-4 py-3">
                  {/* Reply-to indicator */}
                  {replyTo && (
                    <div className="flex items-center gap-2 mb-2 text-[10px] text-muted-foreground bg-white/5 rounded-md px-2 py-1">
                      <Reply className="h-3 w-3 text-primary shrink-0" />
                      <span className="truncate">
                        Replying to <span className="text-foreground">{replyTo.sender_name}</span>: {replyTo.message_text?.slice(0, 60)}
                      </span>
                      <button onClick={() => setReplyTo(null)} className="ml-auto shrink-0 hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* Canned response picker */}
                  {showCanned && (
                    <div ref={cannedListRef} className="mb-2 rounded-lg border border-white/10 bg-[hsl(var(--background))] max-h-[200px] overflow-y-auto thin-scroll">
                      {filteredCanned.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/50 px-3 py-2">No canned responses found</p>
                      ) : (
                        filteredCanned.map((r, idx) => (
                          <button
                            key={r.id}
                            data-selected={idx === cannedIndex}
                            onClick={() => insertCannedResponse(r)}
                            onMouseEnter={() => setCannedIndex(idx)}
                            className={cn(
                              "w-full text-left px-3 py-2 border-b border-white/5 last:border-0",
                              idx === cannedIndex ? "bg-white/10" : "hover:bg-white/5"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Zap className="h-3 w-3 text-primary shrink-0" />
                              <span className="text-xs font-medium text-foreground">{r.title}</span>
                              {r.shortcut && (
                                <span className="text-[10px] text-muted-foreground/50">/{r.shortcut}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-5">{r.body.slice(0, 80)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* AI summary display */}
                  {aiSummary && (
                    <div className="mb-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-primary flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> AI Summary
                        </span>
                        <button onClick={() => setAiSummary(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap">{aiSummary}</p>
                    </div>
                  )}

                  {/* AI action buttons */}
                  <div className="flex items-center gap-1 mb-2">
                    <button
                      onClick={handleAiSummarize}
                      disabled={aiSummarizing}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                      title="AI summarize conversation"
                    >
                      <Sparkles className={cn("h-3 w-3", aiSummarizing && "animate-pulse text-primary")} />
                      {aiSummarizing ? "Summarizing..." : "Summarize"}
                    </button>
                    <button
                      onClick={handleAiSuggestReply}
                      disabled={aiSuggesting}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                      title="AI suggest reply"
                    >
                      <MessageSquare className={cn("h-3 w-3", aiSuggesting && "animate-pulse text-primary")} />
                      {aiSuggesting ? "Thinking..." : "Suggest Reply"}
                    </button>
                  </div>

                  {/* Input row */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                      <textarea
                        ref={replyTextareaRef}
                        value={replyText}
                        onChange={(e) => {
                          setReplyText(e.target.value);
                          // Auto-resize
                          e.target.style.height = "auto";
                          e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                        }}
                        onKeyDown={(e) => {
                          if (showCanned && filteredCanned.length > 0) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setCannedIndex((i) => Math.min(i + 1, filteredCanned.length - 1));
                              // Scroll selected item into view
                              setTimeout(() => {
                                cannedListRef.current?.querySelector("[data-selected=true]")?.scrollIntoView({ block: "nearest" });
                              }, 0);
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setCannedIndex((i) => Math.max(i - 1, 0));
                              setTimeout(() => {
                                cannedListRef.current?.querySelector("[data-selected=true]")?.scrollIntoView({ block: "nearest" });
                              }, 0);
                              return;
                            }
                          }
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (showCanned && filteredCanned.length > 0) {
                              insertCannedResponse(filteredCanned[cannedIndex] ?? filteredCanned[0]);
                            } else {
                              handleSendReply();
                            }
                          }
                          if (e.key === "Escape") {
                            setShowCanned(false);
                            setReplyTo(null);
                          }
                        }}
                        placeholder='Type a reply... (/ for canned responses)'
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[38px] max-h-[120px]"
                        rows={1}
                        disabled={sending}
                      />
                    </div>

                    {/* Emoji picker */}
                    <EmojiPicker onSelect={handleEmojiSelect} />

                    {/* Send-as toggle */}
                    <button
                      onClick={() => setSendAs(sendAs === "user" ? "bot" : "user")}
                      className={cn(
                        "h-[38px] w-[38px] flex items-center justify-center rounded-lg border border-white/10 transition-colors",
                        sendAs === "bot" ? "bg-primary/10 text-primary" : "bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                      title={sendAs === "bot" ? "Sending as Bot" : "Sending as You"}
                    >
                      {sendAs === "bot" ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                    </button>

                    {/* Send button */}
                    <Button
                      size="sm"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      className="h-[38px] px-3"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>

                    {/* Schedule send */}
                    <div className="relative" ref={scheduleRef}>
                      <button
                        onClick={() => setShowScheduleMenu((p) => !p)}
                        disabled={!replyText.trim()}
                        className={cn(
                          "h-[38px] w-[38px] flex items-center justify-center rounded-lg border border-white/10 transition-colors",
                          "text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30"
                        )}
                        title="Schedule send"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                      </button>
                      {showScheduleMenu && (
                        <div className="absolute right-0 bottom-10 z-10 rounded-lg border border-white/10 bg-[hsl(var(--background))] p-2 shadow-xl min-w-[160px]">
                          <p className="text-[10px] text-muted-foreground/60 px-2 pb-1 font-medium">Schedule send</p>
                          {[
                            { label: "In 1 hour", getDate: () => new Date(Date.now() + 3600000) },
                            { label: "Tomorrow 9 AM", getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
                            { label: "Tomorrow 1 PM", getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(13, 0, 0, 0); return d; } },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => handleScheduleSend(opt.getDate())}
                              className="block w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-white/5"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
              );
            })() : (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <div className="text-center">
                  <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground/20" />
                  <p className="mt-2 text-sm text-muted-foreground/50">
                    Select a conversation to view messages
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Deal context sidebar */}
          {showDealSidebar && selectedChat && (deals[selectedChat] ?? []).length > 0 && (
            <DealContextSidebar
              deals={deals[selectedChat] ?? []}
              chatId={selectedChat}
              onClose={() => setShowDealSidebar(false)}
              onDealUpdated={fetchInbox}
            />
          )}
        </div>
      )}

      {/* ── Context Menu ───────────────────────────────────── */}
      {contextMenu && (
        <InboxContextMenu
          contextMenu={contextMenu}
          getLabel={getLabel}
          statuses={statuses}
          toggleLabel={toggleLabel}
          setColorTag={setColorTag}
          handleStatusChange={handleStatusChange}
          onOpenNote={(chatId, groupName) => {
            setNoteModal({ chatId, groupName });
            setNoteText(getLabel(chatId)?.note || "");
          }}
          onNuke={(chatId, name, type) => setNukeTarget({ chatId, name, type })}
          onClose={() => setContextMenu(null)}
          setContextMenu={setContextMenu}
        />
      )}

      {/* ── Note Modal ─────────────────────────────────────── */}
      {noteModal && (
        <NoteModal
          chatId={noteModal.chatId}
          groupName={noteModal.groupName}
          noteText={noteText}
          setNoteText={setNoteText}
          hasExistingNote={!!getLabel(noteModal.chatId)?.note}
          onSave={saveNote}
          onClose={() => setNoteModal(null)}
        />
      )}

      {/* Keyboard Shortcut Help Modal */}
      {showShortcutHelp && (
        <ShortcutHelpModal onClose={() => setShowShortcutHelp(false)} />
      )}

      {/* Nuke modal */}
      {nukeTarget && (
        <NukeProgressModal
          open={!!nukeTarget}
          onClose={() => {
            setNukeTarget(null);
            nukeMessages.reset();
            nukeGroups.reset();
          }}
          type={nukeTarget.type}
          targetName={nukeTarget.name}
          messagesState={nukeTarget.type === "messages" ? nukeMessages.state : undefined}
          groupsState={nukeTarget.type === "groups" ? nukeGroups.state : undefined}
          adminGroups={nukeTarget.type === "groups" ? adminGroups : undefined}
          onConfirm={async (selectedGroups) => {
            if (tgStatus !== "connected") {
              toast.error("Telegram not connected. Connect via Settings > Integrations.");
              return;
            }
            if (nukeTarget.chatId <= 0) {
              toast.error("Nuke actions are only available for private chats.");
              return;
            }
            try {
              const resolved = await tgService.resolveUser(nukeTarget.chatId);
              if (nukeTarget.type === "messages") {
                nukeMessages.start(nukeTarget.chatId, resolved.accessHash, nukeTarget.name);
              } else {
                nukeGroups.start(nukeTarget.chatId, resolved.accessHash, selectedGroups ?? adminGroups);
              }
            } catch {
              toast.error("Could not resolve user. Connect Telegram and load conversations first.");
            }
          }}
          onCancel={nukeTarget.type === "messages" ? nukeMessages.cancel : nukeGroups.cancel}
        />
      )}
    </div>
  );
}

