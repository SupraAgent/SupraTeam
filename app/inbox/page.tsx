"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { NukeProgressModal } from "@/components/telegram/nuke-progress-modal";
import { useNukeMessages } from "@/lib/client/use-nuke-messages";
import { useNukeGroups } from "@/lib/client/use-nuke-groups";
import { useTelegramAdminGroups } from "@/lib/client/use-telegram-admin-groups";
import { useTelegram } from "@/lib/client/telegram-context";
import { TelegramBrowserService } from "@/lib/client/telegram-service";
import type { TgAvailableSession } from "@/lib/client/telegram-service";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { DealContextSidebar } from "@/components/inbox/deal-context-sidebar";
import { LinkDealModal } from "@/components/inbox/link-deal-modal";
import { GlobalMessageSearch } from "@/components/inbox/global-message-search";
import { InlineCannedForm } from "@/components/inbox/inline-canned-form";
import { AssignmentRulesPanel } from "@/components/inbox/assignment-rules-panel";
import { SlideOver } from "@/components/ui/slide-over";
import {
  TgChatGroupPanel,
  useTgChatGroups,
  TG_CHAT_DRAG_TYPE,
} from "@/components/inbox/tg-chat-group-panel";
import type { DragChatData } from "@/components/inbox/tg-chat-group-panel";
import { useInboxFiltering } from "@/lib/client/use-inbox-filtering";
import { useInboxKeyboard } from "@/lib/client/use-inbox-keyboard";
import type { ChatLabel, ThreadMessage, Conversation, InboxStatus, ChatUrgency, InboxTab } from "@/lib/client/inbox-types";
import { URGENCY_RANK } from "@/lib/client/inbox-types";

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

// ── Types (page-local only) ───────────────────────────────────

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
  awaiting_response_since?: string | null;
  outcome?: string | null;
}

interface CannedResponse {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
}

const URGENCY_COLORS: Record<string, { border: string; dot: string; bg: string; text: string }> = {
  critical: { border: "border-l-red-500", dot: "bg-red-500 animate-pulse", bg: "bg-red-500/10", text: "text-red-400" },
  high: { border: "border-l-orange-500", dot: "bg-orange-500", bg: "bg-orange-500/10", text: "text-orange-400" },
};

// Response time threshold (hours) — consistent with deal-card.tsx SLA config
const RESPONSE_OVERDUE_HOURS = 4;

/** Compute a human-readable elapsed time label and color class for response SLA */
function getResponseTimeSla(awaitingSince: string): {
  label: string;
  colorClass: string;
  isOverdue: boolean;
} {
  const waitMs = Date.now() - new Date(awaitingSince).getTime();
  const waitHours = waitMs / 3600000;
  const fullHours = Math.floor(waitHours);
  const fullMins = Math.floor((waitMs % 3600000) / 60000);
  const label = fullHours > 0 ? `${fullHours}h ${fullMins}m` : `${fullMins}m`;

  let colorClass: string;
  if (waitHours < 1) {
    colorClass = "text-emerald-400 bg-emerald-500/10";
  } else if (waitHours < 2) {
    colorClass = "text-yellow-400 bg-yellow-500/10";
  } else if (waitHours < RESPONSE_OVERDUE_HOURS) {
    colorClass = "text-orange-400 bg-orange-500/10";
  } else {
    colorClass = "text-red-400 bg-red-500/10 animate-pulse";
  }

  return { label, colorClass, isOverdue: waitHours >= RESPONSE_OVERDUE_HOURS };
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
  const [urgency, setUrgency] = React.useState<Record<number, ChatUrgency>>({});
  const [statuses, setStatuses] = React.useState<Record<number, InboxStatus>>({});
  const [cannedResponses, setCannedResponses] = React.useState<CannedResponse[]>([]);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<{ id: string; display_name: string }[]>([]);
  const [lastSeen, setLastSeen] = React.useState<Record<number, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [searchMode, setSearchMode] = React.useState<"filter" | "messages">("filter");
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
  const [dealSuggestions, setDealSuggestions] = React.useState<Record<number, Array<{ id: string; deal_name: string; stage_name?: string; contact_name?: string; match_reason: string }>>>({});
  const [dismissedSuggestions, setDismissedSuggestions] = React.useState<Set<number>>(new Set());

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
  const [showCannedForm, setShowCannedForm] = React.useState(false);
  const [showRulesPanel, setShowRulesPanel] = React.useState(false);
  const replyTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const statusesRef = React.useRef(statuses);
  statusesRef.current = statuses;
  const conversationsRef = React.useRef(conversations);
  conversationsRef.current = conversations;
  const labelsRef = React.useRef(labels);
  labelsRef.current = labels;

  // Keyboard shortcut: Shift+M to advance the selected conversation's linked deal
  const dealsRef = React.useRef(deals);
  dealsRef.current = deals;
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const chat = selectedChatRef.current;
      if (e.shiftKey && e.key === "M" && chat) {
        e.preventDefault();
        const chatDeals = dealsRef.current[chat];
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
                  }).then(() => fetchInboxRef.current());
                }},
              });
              fetchInboxRef.current();
            })
            .catch(() => toast.error("Failed to advance deal"));
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const selectedChatRef = React.useRef(selectedChat);
  selectedChatRef.current = selectedChat;

  // Snooze picker
  const [showSnooze, setShowSnooze] = React.useState<number | null>(null);
  const snoozeRef = React.useRef<HTMLDivElement>(null);

  // Bot filter
  const [bots, setBots] = React.useState<{ id: string; label: string }[]>([]);
  const [selectedBotId, setSelectedBotId] = React.useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("inbox_bot_filter") ?? "";
  });

  // TG account filter (multi-account team sessions)
  const [teamSessions, setTeamSessions] = React.useState<TgAvailableSession[]>([]);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("inbox_tg_account_filter") ?? "";
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

  // Fetch team TG sessions for account filter
  React.useEffect(() => {
    TelegramBrowserService.getAvailableSessions(true).then((sessions) => {
      setTeamSessions(sessions.filter((s) => s.is_active));
    });
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
        setUrgency(data.urgency ?? {});
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
        setUrgency((prev) => ({ ...prev, ...(data.urgency ?? {}) }));
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
            // Only evaluate assignment rules if statuses have been loaded
            // (statusesRef starts empty; skip to avoid false-positive unassigned triggers)
            if (Object.keys(statusesRef.current).length > 0 && !currentStatus?.assigned_to) {
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
    // Aggressively fetch deal suggestions whenever a conversation is selected
    // and it has no linked deals — always re-fetch to catch new matches
    if (!(deals[chatId] && deals[chatId].length > 0)) {
      const conv = conversations.find((c) => c.chat_id === chatId);
      if (conv) {
        fetch(`/api/deals/suggest-link?chat_id=${chatId}&chat_title=${encodeURIComponent(conv.group_name)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data?.suggestions) {
              setDealSuggestions((prev) => ({ ...prev, [chatId]: data.suggestions }));
            }
          })
          .catch(() => { /* ignore suggestion fetch errors */ });
      }
    }
  }

  async function quickLinkDeal(dealId: string) {
    if (!selectedChat) return;
    const conv = conversations.find((c) => c.chat_id === selectedChat);
    if (!conv) return;
    const chatType = (conv.group_type === "supergroup" || conv.group_type === "group" || conv.group_type === "channel" || conv.group_type === "dm") ? conv.group_type : "group";
    try {
      const res = await fetch(`/api/deals/${dealId}/linked-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: selectedChat,
          chat_type: chatType,
          chat_title: conv.group_name,
          chat_link: `https://t.me/c/${String(selectedChat).replace(/^-100/, "")}`,
          is_primary: true,
        }),
      });
      if (res.ok) {
        toast.success("Deal linked");
        const chatId = selectedChat;
        if (chatId != null) {
          setDealSuggestions((prev) => {
            const next = { ...prev };
            delete next[chatId];
            return next;
          });
        }
        fetchInbox();
        setShowDealSidebar(true);
      } else {
        toast.error("Failed to link deal");
      }
    } catch {
      toast.error("Failed to link deal");
    }
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
    const chatId = selectedChat;
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
        {
          const conv = conversationsRef.current.find((c) => c.chat_id === chatId);
          if (conv) updateLabel(chatId, conv.group_name, { last_user_message_at: new Date().toISOString() });
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

  // ── Filtering (extracted hook) ──────────────────────────────

  const {
    filtered,
    unassignedCount,
    mineCount,
    awaitingReplyCount,
    urgentCount,
    vipCount,
    archivedCount,
  } = useInboxFiltering({
    conversations,
    search,
    activeTab,
    statuses,
    currentUserId,
    lastSeen,
    labels,
    activeGroupId,
    chatGroups: chatGroups.groups,
    urgency,
  });

  const selectedConversation = selectedChat
    ? conversations.find((c) => c.chat_id === selectedChat)
    : null;

  const filteredCanned = cannedSearch.trim()
    ? cannedResponses.filter((r) =>
        r.title.toLowerCase().includes(cannedSearch.toLowerCase()) ||
        (r.shortcut && r.shortcut.toLowerCase().includes(cannedSearch.toLowerCase()))
      )
    : cannedResponses;

  // Pre-compute per-conversation data so virtual row renders don't scan messages
  const convRowData = React.useMemo(() => {
    const map = new Map<number, {
      slaHours: number | null;
      slaLabel: string | null;
      slaColor: string | null;
      unreadCount: number;
      hasUnread: boolean;
      neverSeen: boolean;
      lastCustomerSentAt: string | null;
    }>();
    for (const conv of filtered) {
      const lastCustomerMsg = conv.messages.find((m) => !m.is_from_bot);
      const slaMs = lastCustomerMsg ? Date.now() - new Date(lastCustomerMsg.sent_at).getTime() : null;
      const slaHours = slaMs ? slaMs / 3600000 : null;
      const slaColor = slaHours === null ? null : slaHours < 1 ? "text-emerald-400" : slaHours < 4 ? "text-amber-400" : "text-red-400";
      const slaLabel = slaHours === null ? null : slaHours < 1 ? `${Math.round(slaHours * 60)}m` : `${Math.round(slaHours)}h`;
      const seenAt = lastSeen[conv.chat_id];
      const neverSeen = !seenAt;
      const unreadCount = seenAt
        ? conv.messages.filter((m) => m.sent_at > seenAt).length +
          conv.messages.reduce((sum, m) => sum + (m.replies?.filter((r: ThreadMessage) => r.sent_at > seenAt).length ?? 0), 0)
        : conv.message_count;
      map.set(conv.chat_id, {
        slaHours, slaLabel, slaColor, unreadCount, neverSeen,
        hasUnread: (unreadCount > 0 || neverSeen),
        lastCustomerSentAt: lastCustomerMsg?.sent_at ?? null,
      });
    }
    return map;
  }, [filtered, lastSeen]);

  // Virtual scroll for conversation list
  const convListRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length + (hasMore ? 1 : 0),
    getScrollElement: () => convListRef.current,
    estimateSize: () => 76,
    overscan: 5,
  });

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

  // ── Keyboard Shortcuts (extracted hook) ─────────────────────

  useInboxKeyboard({
    selectedChat,
    currentUserId,
    conversations,
    filtered,
    highlightedIndex,
    setHighlightedIndex,
    setSelectedChat,
    setShowShortcutHelp,
    setShowScheduleMenu,
    setShowCanned,
    setAiSummary,
    handleAssign,
    handleStatusChange,
    toggleLabel,
    handleSelectChat,
    showShortcutHelp,
    showScheduleMenu,
    showCanned,
    aiSummary,
    replyTextareaRef,
    searchInputRef,
  });

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
            {" "}<button onClick={() => setShowRulesPanel(true)} className="text-primary hover:underline">Assignment rules</button>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const now = new Date().toISOString();
              const chatIds = filtered.map((c) => c.chat_id);
              const updates: Record<number, string> = {};
              for (const id of chatIds) updates[id] = now;
              setLastSeen((prev) => ({ ...prev, ...updates }));
              try {
                await fetch("/api/inbox/seen", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_ids: chatIds }),
                });
              } catch { /* best-effort */ }
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
            { key: "urgent" as InboxTab, label: "Urgent", count: urgentCount, icon: "zap" as const },
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
                  : tab.key === "urgent" ? "bg-red-500/20 text-red-400"
                  : "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {tab.key === "vip" && <Star className="inline h-3 w-3 mr-0.5" />}
              {tab.key === "awaiting_reply" && <Hourglass className="inline h-3 w-3 mr-0.5" />}
              {tab.key === "urgent" && <Zap className="inline h-3 w-3 mr-0.5" />}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
                  tab.key === "unassigned" ? "bg-amber-500/20 text-amber-400" :
                  tab.key === "vip" ? "bg-amber-500/20 text-amber-400" :
                  tab.key === "awaiting_reply" ? "bg-orange-500/20 text-orange-400" :
                  tab.key === "urgent" ? "bg-red-500/20 text-red-400" : "bg-white/10"
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
            placeholder={searchMode === "messages" ? "Search messages..." : "Search... (from: has: is:)"}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <button
          onClick={() => {
            setSearchMode((m) => (m === "filter" ? "messages" : "filter"));
            setSearch("");
          }}
          className={cn(
            "flex items-center gap-1 h-8 px-2.5 rounded-lg border text-[11px] font-medium transition-colors shrink-0",
            searchMode === "messages"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-white/10 bg-transparent text-muted-foreground hover:text-foreground hover:border-white/20"
          )}
          title={searchMode === "messages" ? "Switch to filter chats" : "Switch to search messages"}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{searchMode === "messages" ? "Messages" : "Chats"}</span>
        </button>
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
        {teamSessions.length > 1 && (
          <select
            value={selectedAccountId}
            onChange={(e) => {
              setSelectedAccountId(e.target.value);
              localStorage.setItem("inbox_tg_account_filter", e.target.value);
            }}
            className="h-8 rounded-lg border border-white/10 bg-transparent px-2 text-xs text-foreground"
          >
            <option value="">All Accounts</option>
            {teamSessions.map((s) => (
              <option key={s.id} value={s.telegram_user_id?.toString() ?? s.id}>
                {s.display_name || s.owner_name || `Account ***${s.phone_last4 ?? ""}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Main layout */}
      {filtered.length === 0 && searchMode !== "messages" ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {search ? "No conversations match your search." :
             activeTab === "urgent" ? "No urgent conversations. All clear." :
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
          {/* Left column: Conversation list / Message search + Chat groups */}
          <div className="flex flex-col gap-2 min-h-0">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex-1">
            {searchMode === "messages" ? (
              <div className="max-h-[70vh]">
                <GlobalMessageSearch
                  onSelectChat={(chatId) => {
                    setSelectedChat(chatId);
                    setSearchMode("filter");
                  }}
                />
              </div>
            ) : (
            <div ref={convListRef} className="max-h-[70vh] overflow-y-auto thin-scroll">
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  // Load-more sentinel at the end
                  if (virtualRow.index >= filtered.length) {
                    return (
                      <div
                        key="load-more"
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <InboxLoadMore loading={loadingMore} onVisible={loadMore} />
                      </div>
                    );
                  }

                  const convIndex = virtualRow.index;
                  const conv = filtered[convIndex];
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
                  const chatUrgency = urgency[conv.chat_id];
                  const urgColors = chatUrgency ? URGENCY_COLORS[chatUrgency.level] : null;

                  const rowData = convRowData.get(conv.chat_id);
                  const { slaHours, slaLabel, slaColor, unreadCount, neverSeen, lastCustomerSentAt } = rowData ?? { slaHours: null, slaLabel: null, slaColor: null, unreadCount: 0, neverSeen: false, lastCustomerSentAt: null };
                  const hasUnread = (unreadCount > 0 || neverSeen) && !isSelected;

                  return (
                    <div
                      key={conv.chat_id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                      className="border-b border-white/5"
                    >
                      <button
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
                          "w-full text-left px-3 py-2.5 transition-colors cursor-grab active:cursor-grabbing border-l-2 border-l-transparent",
                          isSelected ? "bg-primary/10" :
                          convIndex === highlightedIndex ? "bg-white/[0.06] ring-1 ring-primary/30" :
                          urgColors && !isSelected ? urgColors.bg :
                          label?.is_vip ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]" :
                          "hover:bg-white/[0.04]",
                          urgColors && urgColors.border,
                          label?.is_muted && "opacity-50"
                        )}
                        style={!urgColors && tagColor && !label?.is_vip ? { borderLeftWidth: 3, borderLeftColor: tagColor } : undefined}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          {urgColors ? (
                            <span
                              className={cn("h-2 w-2 rounded-full shrink-0", urgColors.dot)}
                              title={chatUrgency ? `${chatUrgency.level}: ${chatUrgency.summary ?? chatUrgency.category ?? ""}` : undefined}
                            />
                          ) : hasUnread ? (
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
                          {chatUrgency && urgColors && (
                            <span
                              className={cn("rounded px-1 py-0 text-[9px] font-medium", urgColors.bg, urgColors.text)}
                              title={chatUrgency.summary ?? undefined}
                            >
                              {chatUrgency.category?.replace("_", " ") ?? chatUrgency.level}
                            </span>
                          )}
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
                          {activeTab === "awaiting_reply" && lastCustomerSentAt && (
                            <span className="text-[10px] text-orange-400/70 flex items-center gap-0.5" title="Awaiting reply since">
                              <Hourglass className="h-2.5 w-2.5" />
                              {timeAgo(lastCustomerSentAt)}
                            </span>
                          )}
                          {/* Response time SLA indicator from linked deal */}
                          {(() => {
                            const linkedDeal = chatDeals.find(
                              (d) => d.awaiting_response_since && (!d.outcome || d.outcome === "open")
                            );
                            if (!linkedDeal?.awaiting_response_since) return null;
                            const sla = getResponseTimeSla(linkedDeal.awaiting_response_since);
                            return (
                              <span
                                className={cn(
                                  "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0",
                                  sla.colorClass
                                )}
                                title={`Awaiting reply: ${sla.label}${sla.isOverdue ? " (SLA breached)" : ""}`}
                              >
                                <Clock className="h-2.5 w-2.5" />
                                {sla.label}
                              </span>
                            );
                          })()}
                          {assignee && (
                            <span className="text-[10px] text-primary/60 truncate max-w-[80px]">{assignee.display_name}</span>
                          )}
                          {teamSessions.length > 1 && (() => {
                            const senderIds = new Set(conv.messages.map((m) => m.sender_telegram_id));
                            const matchedSession = teamSessions.find((s) =>
                              s.telegram_user_id && senderIds.has(s.telegram_user_id)
                            );
                            if (!matchedSession) return null;
                            const label2 = matchedSession.display_name || matchedSession.owner_name || `***${matchedSession.phone_last4 ?? ""}`;
                            return (
                              <span
                                className="text-[9px] rounded px-1 py-0 bg-indigo-500/15 text-indigo-400 truncate max-w-[70px]"
                                title={`TG Account: ${label2}`}
                              >
                                <UserIcon className="inline h-2 w-2 mr-0.5" />{label2}
                              </span>
                            );
                          })()}
                          {chatDeals.length > 0 && (() => {
                            const primaryDeal = chatDeals[0];
                            return (
                              <span className="flex items-center gap-1 ml-auto shrink-0 max-w-[45%] min-w-0">
                                {primaryDeal.stage && (
                                  <span
                                    className="rounded px-1 py-0 text-[9px] font-medium truncate"
                                    style={{
                                      backgroundColor: primaryDeal.stage.color ? `${primaryDeal.stage.color}20` : "rgba(139,92,246,0.12)",
                                      color: primaryDeal.stage.color || "#8b5cf6",
                                    }}
                                    title={`Stage: ${primaryDeal.stage.name}`}
                                  >
                                    {primaryDeal.stage.name}
                                  </span>
                                )}
                                {primaryDeal.contact && (
                                  <span className="text-[9px] text-muted-foreground/70 truncate" title={primaryDeal.contact.name}>
                                    {primaryDeal.contact.name}
                                  </span>
                                )}
                                {chatDeals.length > 1 && (
                                  <span className="text-[9px] text-primary/50">+{chatDeals.length - 1}</span>
                                )}
                              </span>
                            );
                          })()}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            )}
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

                {/* Deal suggestion banner — prominent sticky banner */}
                {(deals[selChatId] ?? []).length === 0
                  && (dealSuggestions[selChatId] ?? []).length > 0
                  && !dismissedSuggestions.has(selChatId) && (
                  <div className="sticky top-0 z-10 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 px-4 py-2.5 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/20 shrink-0">
                          <Link2 className="h-3.5 w-3.5 text-amber-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {dealSuggestions[selChatId].slice(0, 1).map((s) => (
                              <span key={s.id} className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                                Link to: <span className="text-amber-300">{s.deal_name}</span>
                                {s.stage_name && (
                                  <span className="text-[10px] rounded px-1.5 py-0.5 bg-white/10 text-muted-foreground font-normal">{s.stage_name}</span>
                                )}
                              </span>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                            {dealSuggestions[selChatId][0].match_reason}
                            {dealSuggestions[selChatId].length > 1 && (
                              <span className="text-primary/60 ml-1">+{dealSuggestions[selChatId].length - 1} more</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => quickLinkDeal(dealSuggestions[selChatId][0].id)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 hover:border-amber-500/40 transition-colors"
                        >
                          <Zap className="h-3 w-3" />
                          Link
                        </button>
                        {dealSuggestions[selChatId].length > 1 && (
                          <button
                            onClick={() => setLinkDealModal(true)}
                            className="inline-flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                          >
                            See all
                          </button>
                        )}
                        <button
                          onClick={() => setDismissedSuggestions((prev) => new Set(prev).add(selChatId))}
                          className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/5 transition-colors"
                          title="Dismiss suggestion"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
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
                    <div ref={cannedListRef} className="mb-2 rounded-lg border border-white/10 bg-[hsl(var(--background))] max-h-[280px] overflow-y-auto thin-scroll">
                      {filteredCanned.length === 0 && !showCannedForm ? (
                        <div className="px-3 py-2">
                          <p className="text-[10px] text-muted-foreground/50">No canned responses found</p>
                          <button onClick={() => setShowCannedForm(true)} className="text-[10px] text-primary hover:underline">Create your first response</button>
                        </div>
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
                      {showCannedForm ? (
                        <InlineCannedForm
                          onCreated={() => {
                            setShowCannedForm(false);
                            fetch("/api/inbox/canned").then((r) => r.ok ? r.json() : null).then((d) => {
                              if (d) setCannedResponses(d.responses ?? []);
                            });
                          }}
                          onCancel={() => setShowCannedForm(false)}
                        />
                      ) : (
                        <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/5">
                          <button onClick={() => setShowCannedForm(true)} className="text-[10px] text-primary hover:underline">+ New response</button>
                          <a href="/settings/inbox/canned" className="text-[10px] text-primary hover:underline">Manage all</a>
                        </div>
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

      <SlideOver
        open={showRulesPanel}
        onClose={() => setShowRulesPanel(false)}
        title="Assignment Rules"
      >
        <AssignmentRulesPanel />
      </SlideOver>
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
