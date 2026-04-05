"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageCircle,
  Search,
  Users,
  ExternalLink,
  Reply,
  Clock,
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
  BellOff,
  Archive,
  Tag,
  StickyNote,
  ChevronLeft,
  Flame,
  UserX,
  Sparkles,
  MessageSquare,
  Keyboard,
  CalendarClock,
  Hourglass,
  Plus,
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
import { LinkDealModal } from "@/components/inbox/link-deal-modal";
import {
  TgChatGroupPanel,
  useTgChatGroups,
  TG_CHAT_DRAG_TYPE,
} from "@/components/inbox/tg-chat-group-panel";
import type { DragChatData } from "@/components/inbox/tg-chat-group-panel";

// ── Chat Label Types & Constants ────────────────────────────────

interface ChatLabel {
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

const COLOR_TAGS = [
  { key: "hot_lead", label: "Hot Lead", color: "#ef4444" },
  { key: "partner", label: "Partner", color: "#3b82f6" },
  { key: "investor", label: "Investor", color: "#8b5cf6" },
  { key: "vip_client", label: "VIP Client", color: "#f59e0b" },
  { key: "urgent", label: "Urgent", color: "#f97316" },
  { key: "follow_up", label: "Follow Up", color: "#06b6d4" },
] as const;

function emptyLabel(chatId: number): ChatLabel {
  return {
    id: "", telegram_chat_id: chatId,
    is_vip: false, is_archived: false, is_pinned: false, is_muted: false,
    color_tag: null, color_tag_color: null, note: null,
    snoozed_until: null, last_user_message_at: null, last_contact_message_at: null,
  };
}

// ── Types ──────────────────────────────────────────────────────

interface ThreadMessage {
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

interface Conversation {
  chat_id: number;
  group_name: string;
  group_type: string;
  tg_group_id: string;
  member_count: number | null;
  message_count: number;
  latest_at: string | null;
  messages: ThreadMessage[];
}

interface Deal {
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

interface InboxStatus {
  chat_id: number;
  status: "open" | "snoozed" | "closed";
  assigned_to: string | null;
  snoozed_until: string | null;
  closed_at: string | null;
  updated_at: string;
}

interface CannedResponse {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
}

type InboxTab = "awaiting_reply" | "mine" | "unassigned" | "open" | "vip" | "archived" | "closed";

// ── Advanced Search Parser ─────────────────────────────────────
interface SearchFilters {
  text: string;
  fromUsername: string | null;
  hasAttachment: boolean;
  isUnread: boolean;
  isVip: boolean;
}

function parseSearchFilters(raw: string): SearchFilters {
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
  const [linkDealModal, setLinkDealModal] = React.useState(false);

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
  const labelsRef = React.useRef(labels);
  labelsRef.current = labels;

  // Keyboard shortcut: Shift+M to advance the selected conversation's linked deal
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.shiftKey && e.key === "M" && selectedChat) {
        e.preventDefault();
        const chatDeals = deals[selectedChat];
        const linkedDeal = chatDeals?.[0];
        if (linkedDeal) {
          fetch(`/api/deals/${linkedDeal.id}/advance`, { method: "POST" })
            .then((r) => {
              if (r.ok) return r.json();
              throw new Error("Failed");
            })
            .then((data) => {
              toast.success(`Advanced to ${data.to_stage?.name ?? "next stage"}`, {
                action: { label: "Undo", onClick: () => {
                  fetch(`/api/deals/${linkedDeal.id}/move`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ stage_id: data.from_stage?.id }),
                  }).then(() => fetchInbox());
                }},
              });
              fetchInbox();
            })
            .catch(() => toast.error("Failed to advance deal"));
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedChat, deals]);
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
  const [selectedBotId, setSelectedBotId] = React.useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("inbox_bot_filter") ?? "";
  });

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
                [chatId]: { ...prev[chatId], status: "open" as const, closed_at: null } as InboxStatus,
              }));
              fetch("/api/inbox/status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, status: "open" }),
              });
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
              });
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
    if (!replyText.trim() || !selectedChat) return;
    setSending(true);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: selectedChat,
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
            if (c.chat_id !== selectedChat) return c;
            const optimisticMsg: ThreadMessage = {
              id: `optimistic-${Date.now()}`,
              telegram_message_id: -Date.now(),
              telegram_chat_id: selectedChat,
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
        if (selectedChat) {
          const conv = conversationsRef.current.find((c) => c.chat_id === selectedChat);
          if (conv) updateLabel(selectedChat, conv.group_name, { last_user_message_at: new Date().toISOString() });
        }
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

  // Close context menu on click
  React.useEffect(() => {
    if (!contextMenu) return;
    function handleClick() { setContextMenu(null); }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu]);

  function insertCannedResponse(response: CannedResponse) {
    // Render merge vars from linked deals
    let text = response.body;
    if (selectedChat) {
      const chatDeals = deals[selectedChat];
      if (chatDeals && chatDeals.length > 0) {
        const deal = chatDeals[0];
        text = text
          .replace(/\{\{deal_name\}\}/g, deal.deal_name ?? "")
          .replace(/\{\{contact_name\}\}/g, deal.contact?.name ?? "")
          .replace(/\{\{stage\}\}/g, (deal.stage as { name: string } | null)?.name ?? "")
          .replace(/\{\{board_type\}\}/g, deal.board_type ?? "");
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

  const unassignedCount = conversations.filter((c) => {
    const s = statuses[c.chat_id];
    return (!s || !s.assigned_to) && (!s || s.status !== "closed");
  }).length;

  const mineCount = conversations.filter((c) => {
    const s = statuses[c.chat_id];
    return s?.assigned_to === currentUserId && s?.status !== "closed";
  }).length;

  const awaitingReplyCount = conversations.filter((c) => {
    const s = statuses[c.chat_id];
    if (s?.status === "closed" || getLabel(c.chat_id)?.is_archived) return false;
    const lastMsg = c.messages[0];
    return lastMsg && !lastMsg.is_from_bot;
  }).length;


  const vipCount = conversations.filter((c) => getLabel(c.chat_id)?.is_vip && !getLabel(c.chat_id)?.is_archived).length;
  const archivedCount = conversations.filter((c) => getLabel(c.chat_id)?.is_archived).length;

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

  // Refs for keyboard handler to avoid stale closures
  const handleAssignRef = React.useRef(handleAssign);
  handleAssignRef.current = handleAssign;
  const handleStatusChangeRef = React.useRef(handleStatusChange);
  handleStatusChangeRef.current = handleStatusChange;
  const toggleLabelRef = React.useRef(toggleLabel);
  toggleLabelRef.current = toggleLabel;
  const handleSelectChatRef = React.useRef(handleSelectChat);
  handleSelectChatRef.current = handleSelectChat;
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

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      // ? always toggles help
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        if (isInput && target.tagName !== "INPUT") return;
        // Allow ? in textareas but not plain typing
        if (target.tagName === "INPUT") return;
        e.preventDefault();
        setShowShortcutHelp((p) => !p);
        return;
      }

      // Escape works everywhere
      if (e.key === "Escape") {
        if (showShortcutHelpRef.current) { setShowShortcutHelp(false); return; }
        if (showScheduleMenuRef.current) { setShowScheduleMenu(false); return; }
        if (showCannedRef.current) { setShowCanned(false); return; }
        if (aiSummaryRef.current) { setAiSummary(null); return; }
        if (selectedChatRef.current) { setSelectedChat(null); return; }
        return;
      }

      // Skip shortcuts when typing in input/textarea
      if (isInput) return;

      const chat = selectedChatRef.current;
      const userId = currentUserIdRef.current;
      const currentFiltered = filteredRef.current;
      const selectedConv = chat
        ? conversationsRef.current.find((c) => c.chat_id === chat)
        : null;

      // Shift+A — assign to me
      if (e.key === "A" && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (chat && userId) {
          e.preventDefault();
          handleAssignRef.current(chat, userId);
        }
        return;
      }

      switch (e.key) {
        case "j": {
          // Next conversation
          e.preventDefault();
          setHighlightedIndex((prev) => Math.min(prev + 1, currentFiltered.length - 1));
          break;
        }
        case "k": {
          // Previous conversation
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Enter": {
          // Open highlighted conversation
          const idx = highlightedIndexRef.current;
          if (idx >= 0 && idx < currentFiltered.length) {
            e.preventDefault();
            handleSelectChatRef.current(currentFiltered[idx].chat_id);
          }
          break;
        }
        case "r": {
          // Focus reply textarea
          if (chat && replyTextareaRef.current) {
            e.preventDefault();
            replyTextareaRef.current.focus();
          }
          break;
        }
        case "e": {
          // Archive
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_archived");
          }
          break;
        }
        case "s": {
          // Toggle VIP/star
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_vip");
          }
          break;
        }
        case "p": {
          // Toggle pin
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_pinned");
          }
          break;
        }
        case "m": {
          // Toggle mute
          if (selectedConv) {
            e.preventDefault();
            toggleLabelRef.current(selectedConv.chat_id, selectedConv.group_name, "is_muted");
          }
          break;
        }
        case "/": {
          // Focus search when no conversation open
          if (!chat && searchInputRef.current) {
            e.preventDefault();
            searchInputRef.current.focus();
          }
          break;
        }
        case "n": {
          // Snooze / mark unread
          if (chat) {
            e.preventDefault();
            const oneHour = new Date(Date.now() + 3600000).toISOString();
            handleStatusChangeRef.current(chat, "snoozed", oneHour);
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
              {filtered.map((conv, convIndex) => {
                const chatDeals = deals[conv.chat_id] ?? [];
                const lastMsg = conv.messages[0];
                const isSelected = selectedChat === conv.chat_id;
                const status = statuses[conv.chat_id];
                const label = getLabel(conv.chat_id);
                const assignee = status?.assigned_to
                  ? teamMembers.find((m) => m.id === status.assigned_to)
                  : null;
                const colorTag = label?.color_tag ? COLOR_TAGS.find((t) => t.key === label.color_tag) : null;
                const tagColor = colorTag?.color || label?.color_tag_color || null;

                // SLA: time since last customer (non-bot) message
                const lastCustomerMsg = conv.messages.find((m) => !m.is_from_bot);
                const slaMs = lastCustomerMsg ? Date.now() - new Date(lastCustomerMsg.sent_at).getTime() : null;
                const slaHours = slaMs ? slaMs / 3600000 : null;
                const slaColor = slaHours === null ? null : slaHours < 1 ? "text-emerald-400" : slaHours < 4 ? "text-amber-400" : "text-red-400";
                const slaLabel = slaHours === null ? null : slaHours < 1 ? `${Math.round(slaHours * 60)}m` : `${Math.round(slaHours)}h`;

                // Unread detection: messages newer than last_seen_at
                const seenAt = lastSeen[conv.chat_id];
                const neverSeen = !seenAt;
                const unreadCount = seenAt
                  ? conv.messages.filter((m) => m.sent_at > seenAt).length +
                    conv.messages.reduce((sum, m) => sum + (m.replies?.filter((r: ThreadMessage) => r.sent_at > seenAt).length ?? 0), 0)
                  : conv.message_count;
                const hasUnread = (unreadCount > 0 || neverSeen) && !isSelected;

                return (
                  <button
                    key={conv.chat_id}
                    draggable
                    onDragStart={(e) => {
                      const dragData: DragChatData = {
                        chatId: conv.chat_id,
                        chatTitle: conv.group_name,
                      };
                      e.dataTransfer.setData(TG_CHAT_DRAG_TYPE, JSON.stringify(dragData));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => handleSelectChat(conv.chat_id)}
                    onContextMenu={(e) => handleContextMenu(e, conv.chat_id, conv.group_name)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 transition-colors cursor-grab active:cursor-grabbing",
                      isSelected ? "bg-primary/10" :
                      convIndex === highlightedIndex ? "bg-white/[0.06] ring-1 ring-primary/30" :
                      label?.is_vip ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]" :
                      "hover:bg-white/[0.04]",
                      label?.is_muted && "opacity-50"
                    )}
                    style={tagColor && !label?.is_vip ? { borderLeftWidth: 3, borderLeftColor: tagColor } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {hasUnread ? (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" title={`${unreadCount} unread`} />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      {label?.is_vip && <Star className="h-3 w-3 text-amber-400 shrink-0" />}
                      {label?.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                      <span className={cn(
                        "text-sm truncate",
                        hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground",
                        label?.is_vip && "text-amber-200"
                      )}>{conv.group_name}</span>
                      {hasUnread && (
                        <span className={cn(
                          "rounded-full text-[10px] font-bold px-1.5 py-0.5 shrink-0",
                          label?.is_vip ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"
                        )}>
                          {neverSeen ? "new" : unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                      {!status?.assigned_to && status?.status !== "closed" && (
                        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Unassigned" />
                      )}
                      {conv.member_count && (
                        <span className="text-[10px] text-muted-foreground/50 shrink-0 flex items-center gap-0.5 ml-auto">
                          <Users className="h-2.5 w-2.5" />
                          {conv.member_count}
                        </span>
                      )}
                    </div>

                    {/* Color tag + note indicator */}
                    {(colorTag || label?.note) && (
                      <div className="flex items-center gap-1 pl-5 mb-0.5">
                        {colorTag && (
                          <span className="rounded px-1 py-0 text-[9px] font-medium" style={{ backgroundColor: `${tagColor}20`, color: tagColor || undefined }}>
                            {colorTag.label}
                          </span>
                        )}
                        {label?.note && <StickyNote className="h-2.5 w-2.5 text-yellow-500/60 shrink-0" />}
                      </div>
                    )}

                    {lastMsg && (
                      <p className="text-[11px] text-muted-foreground truncate pl-5">
                        <span className="text-foreground/70">{lastMsg.sender_name.split(" ")[0]}:</span>{" "}
                        {lastMsg.message_text?.slice(0, 80) ?? "(media)"}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pl-5 mt-0.5">
                      {conv.latest_at && (
                        <span className="text-[10px] text-muted-foreground/50">{timeAgo(conv.latest_at)}</span>
                      )}
                      {slaLabel && status?.status !== "closed" && (
                        <span
                          className={cn(
                            "font-medium",
                            slaHours && slaHours >= 4
                              ? "text-[10px] rounded-full px-1.5 py-0.5 bg-red-500/15 text-red-400"
                              : cn("text-[10px]", slaColor)
                          )}
                          title="Time since last customer message"
                        >
                          {slaHours && slaHours >= 4 ? `⏱ ${slaLabel}` : slaLabel}
                        </span>
                      )}
                      {activeTab === "awaiting_reply" && lastCustomerMsg && (
                        <span className="text-[10px] text-orange-400/70 flex items-center gap-0.5" title="Awaiting reply since">
                          <Hourglass className="h-2.5 w-2.5" />
                          {timeAgo(lastCustomerMsg.sent_at)}
                        </span>
                      )}
                      {assignee && (
                        <span className="text-[10px] text-primary/60 truncate max-w-[80px]">{assignee.display_name}</span>
                      )}
                      {chatDeals.length > 0 && (
                        <span className="text-[10px] text-primary/70 ml-auto">
                          {chatDeals.length} deal{chatDeals.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
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
                    <button
                      onClick={() => setLinkDealModal(true)}
                      className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {(deals[selChatId] ?? []).length === 0 ? "Link Deal" : "Link Another"}
                    </button>
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
              onLinkDeal={() => setLinkDealModal(true)}
            />
          )}
        </div>
      )}

      {/* ── Context Menu ───────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-card shadow-xl py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.submenu && (
            <>
              <CtxItem
                icon={<Star className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.chatId)?.is_vip ? "Remove VIP" : "Mark as VIP"}
                active={getLabel(contextMenu.chatId)?.is_vip} activeColor="text-amber-400"
                onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_vip"); setContextMenu(null); }}
              />
              <CtxItem
                icon={<Pin className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.chatId)?.is_pinned ? "Unpin" : "Pin to top"}
                active={getLabel(contextMenu.chatId)?.is_pinned}
                onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_pinned"); setContextMenu(null); }}
              />
              <CtxItem
                icon={<BellOff className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.chatId)?.is_muted ? "Unmute" : "Mute"}
                active={getLabel(contextMenu.chatId)?.is_muted}
                onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_muted"); setContextMenu(null); }}
              />
              <div className="border-t border-white/10 my-1" />
              <CtxItem
                icon={<Tag className="h-3.5 w-3.5" />} label="Tag as..."
                onClick={() => setContextMenu({ ...contextMenu, submenu: "tag" })} hasArrow
              />
              <CtxItem
                icon={<AlarmClock className="h-3.5 w-3.5" />}
                label={statuses[contextMenu.chatId]?.status === "snoozed" ? "Snoozed — unsnooze" : "Snooze..."}
                active={statuses[contextMenu.chatId]?.status === "snoozed"} activeColor="text-cyan-400"
                onClick={() => {
                  if (statuses[contextMenu.chatId]?.status === "snoozed") {
                    handleStatusChange(contextMenu.chatId, "open");
                    setContextMenu(null);
                  } else {
                    setContextMenu({ ...contextMenu, submenu: "snooze" });
                  }
                }}
                hasArrow={statuses[contextMenu.chatId]?.status !== "snoozed"}
              />
              <CtxItem
                icon={<StickyNote className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.chatId)?.note ? "Edit note" : "Add note"}
                active={!!getLabel(contextMenu.chatId)?.note} activeColor="text-yellow-400"
                onClick={() => {
                  setNoteModal({ chatId: contextMenu.chatId, groupName: contextMenu.groupName });
                  setNoteText(getLabel(contextMenu.chatId)?.note || "");
                  setContextMenu(null);
                }}
              />
              <div className="border-t border-white/10 my-1" />
              <CtxItem
                icon={<Archive className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.chatId)?.is_archived ? "Unarchive" : "Archive"}
                active={getLabel(contextMenu.chatId)?.is_archived}
                onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_archived"); setContextMenu(null); }}
              />
              {/* Nuke actions only for private chats (positive chat IDs = user IDs) */}
              {contextMenu.chatId > 0 && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <CtxItem
                    icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
                    label="Delete My Messages"
                    onClick={() => { setNukeTarget({ chatId: contextMenu.chatId, name: contextMenu.groupName, type: "messages" }); setContextMenu(null); }}
                  />
                  <CtxItem
                    icon={<UserX className="h-3.5 w-3.5 text-red-400" />}
                    label="Kick from My Groups"
                    onClick={() => { setNukeTarget({ chatId: contextMenu.chatId, name: contextMenu.groupName, type: "groups" }); setContextMenu(null); }}
                  />
                </>
              )}
            </>
          )}

          {/* Tag submenu */}
          {contextMenu.submenu === "tag" && (
            <>
              <CtxItem
                icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Back"
                onClick={() => setContextMenu({ ...contextMenu, submenu: undefined })}
              />
              <div className="border-t border-white/10 my-1" />
              {COLOR_TAGS.map((t) => (
                <CtxItem
                  key={t.key}
                  icon={<div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />}
                  label={t.label}
                  active={getLabel(contextMenu.chatId)?.color_tag === t.key}
                  onClick={() => {
                    const current = getLabel(contextMenu.chatId)?.color_tag;
                    setColorTag(contextMenu.chatId, contextMenu.groupName, current === t.key ? null : t.key, current === t.key ? null : t.color);
                    setContextMenu(null);
                  }}
                />
              ))}
              {getLabel(contextMenu.chatId)?.color_tag && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <CtxItem
                    icon={<X className="h-3.5 w-3.5" />} label="Remove tag"
                    onClick={() => { setColorTag(contextMenu.chatId, contextMenu.groupName, null, null); setContextMenu(null); }}
                  />
                </>
              )}
            </>
          )}

          {/* Snooze submenu */}
          {contextMenu.submenu === "snooze" && (
            <>
              <CtxItem
                icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Back"
                onClick={() => setContextMenu({ ...contextMenu, submenu: undefined })}
              />
              <div className="border-t border-white/10 my-1" />
              {[
                { label: "1 hour", hours: 1 },
                { label: "4 hours", hours: 4 },
                { label: "Tomorrow 9am", hours: -1 },
                { label: "1 day", hours: 24 },
                { label: "3 days", hours: 72 },
                { label: "1 week", hours: 168 },
              ].map((opt) => {
                const until = opt.hours === -1
                  ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); })()
                  : new Date(Date.now() + opt.hours * 3600000).toISOString();
                return (
                  <CtxItem
                    key={opt.label}
                    icon={<AlarmClock className="h-3.5 w-3.5" />}
                    label={opt.label}
                    onClick={() => { handleStatusChange(contextMenu.chatId, "snoozed", until); setContextMenu(null); }}
                  />
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Note Modal ─────────────────────────────────────── */}
      {/* ── Link Deal Modal ───────────────────────────────── */}
      {selectedConversation && (
        <LinkDealModal
          chatId={selectedConversation.chat_id}
          chatType={(selectedConversation.group_type === "supergroup" || selectedConversation.group_type === "group" || selectedConversation.group_type === "channel" || selectedConversation.group_type === "dm") ? selectedConversation.group_type as "dm" | "group" | "channel" | "supergroup" : "group"}
          chatTitle={selectedConversation.group_name}
          chatLink={`https://t.me/c/${String(selectedConversation.chat_id).replace(/^-100/, "")}`}
          open={linkDealModal}
          onClose={() => setLinkDealModal(false)}
          onDealLinked={() => {
            fetchInbox();
            setShowDealSidebar(true);
          }}
        />
      )}

      {noteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setNoteModal(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setNoteModal(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Note — {noteModal.groupName}</h3>
              <button onClick={() => setNoteModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a quick note about this conversation..."
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              {getLabel(noteModal.chatId)?.note && (
                <Button size="sm" variant="ghost" onClick={() => { saveNote(noteModal.chatId, noteModal.groupName, ""); setNoteModal(null); }}>
                  Delete note
                </Button>
              )}
              <Button size="sm" onClick={() => { saveNote(noteModal.chatId, noteModal.groupName, noteText); setNoteModal(null); }}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcut Help Modal */}
      {showShortcutHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowShortcutHelp(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowShortcutHelp(false); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-primary" />
                Keyboard Shortcuts
              </h3>
              <button onClick={() => setShowShortcutHelp(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              {([
                ["j / k", "Next / previous conversation"],
                ["Enter", "Open selected conversation"],
                ["Escape", "Close / deselect"],
                ["r", "Focus reply"],
                ["e", "Archive conversation"],
                ["s", "Toggle VIP / star"],
                ["p", "Toggle pin"],
                ["m", "Toggle mute"],
                ["n", "Snooze (1 hour)"],
                ["/", "Focus search"],
                ["Shift+A", "Assign to me"],
                ["?", "Toggle this help"],
              ] as const).map(([key, desc]) => (
                <div key={key} className="flex items-center gap-2 py-1">
                  <kbd className="inline-flex items-center justify-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground min-w-[28px]">
                    {key}
                  </kbd>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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

// ── Context Menu Item ─────────────────────────────────────────

function CtxItem({ icon, label, active, activeColor, onClick, hasArrow }: {
  icon: React.ReactNode; label: string; active?: boolean; activeColor?: string; onClick: () => void; hasArrow?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
        active ? (activeColor || "text-primary") : "text-foreground"
      }`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {hasArrow && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

// ── MessageBubble ────────────────────────────────────────────

function MessageBubble({ msg, compact, onReply }: { msg: ThreadMessage; compact?: boolean; onReply?: () => void }) {
  const chatIdStr = String(msg.telegram_chat_id);
  const supergroupId = chatIdStr.startsWith("-100") ? chatIdStr.slice(4) : null;
  const deepLink = supergroupId
    ? `https://t.me/c/${supergroupId}/${msg.telegram_message_id}`
    : null;

  return (
    <div className={cn("flex gap-2", compact ? "py-0.5" : "py-1")}>
      <div className={cn(
        "flex items-center justify-center rounded-full shrink-0 font-bold",
        msg.is_from_bot ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground",
        compact ? "h-5 w-5 text-[8px]" : "h-7 w-7 text-[10px]"
      )}>
        {msg.sender_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("font-medium text-foreground", compact ? "text-[10px]" : "text-xs")}>
            {msg.sender_name}
          </span>
          {msg.sender_username && (
            <span className="text-[10px] text-muted-foreground/50">@{msg.sender_username}</span>
          )}
          <span className="text-[10px] text-muted-foreground/40 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(msg.sent_at)}
          </span>
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/30 hover:text-primary transition-colors"
              title="Open in Telegram"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {onReply && (
            <button
              onClick={(e) => { e.stopPropagation(); onReply(); }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-primary transition-all"
              title="Reply to this message"
            >
              <Reply className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <p className={cn(
          "text-muted-foreground whitespace-pre-wrap break-words",
          compact ? "text-[10px]" : "text-xs"
        )}>
          {msg.message_text ?? `(${msg.message_type})`}
        </p>
      </div>
    </div>
  );
}
