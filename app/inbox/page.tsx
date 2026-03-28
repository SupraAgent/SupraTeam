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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

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
  stage: { name: string; color: string } | null;
  assigned_to: string | null;
  contact: { id: string; name: string } | null;
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

type InboxTab = "mine" | "unassigned" | "all" | "closed";

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
  const [expandedThreads, setExpandedThreads] = React.useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<InboxTab>("all");

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

  // Snooze picker
  const [showSnooze, setShowSnooze] = React.useState<number | null>(null);
  const snoozeRef = React.useRef<HTMLDivElement>(null);

  // ── Data Fetching ──────────────────────────────────────────

  const fetchInbox = React.useCallback(async () => {
    try {
      const [inboxRes, statusRes, cannedRes, seenRes] = await Promise.all([
        fetch("/api/inbox"),
        fetch("/api/inbox/status"),
        fetch("/api/inbox/canned"),
        fetch("/api/inbox/seen"),
      ]);

      if (inboxRes.ok) {
        const data = await inboxRes.json();
        // Replace conversations, dropping any optimistic messages from previous sends
        setConversations((data.conversations ?? []).map((c: Conversation) => ({
          ...c,
          messages: c.messages.filter((m: ThreadMessage) => !String(m.id).startsWith("optimistic-")),
        })));
        setDeals(data.deals ?? {});
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatuses(data.statuses ?? {});
      }
      if (cannedRes.ok) {
        const data = await cannedRes.json();
        setCannedResponses(data.responses ?? []);
      }
      if (seenRes.ok) {
        const data = await seenRes.json();
        setLastSeen(data.seen ?? {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
            await fetchInbox();
            // Auto-reopen: if the new message is in a closed conversation, reopen it
            const chatId = (payload.new as Record<string, unknown>)?.telegram_chat_id;
            if (chatId) {
              setStatuses((prev) => {
                const s = prev[chatId as number];
                if (s?.status === "closed") {
                  // Fire-and-forget PATCH to reopen server-side
                  fetch("/api/inbox/status", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, status: "open" }),
                  });
                  return { ...prev, [chatId as number]: { ...s, status: "open" as const, closed_at: null } };
                }
                return prev;
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
  }, [fetchInbox]);

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

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.group_name.toLowerCase().includes(q) ||
        c.messages.some((m) =>
          m.message_text?.toLowerCase().includes(q) ||
          m.sender_name.toLowerCase().includes(q)
        )
      );
    }

    // Tab filtering
    if (activeTab === "mine") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        return s?.assigned_to === currentUserId && s?.status !== "closed";
      });
    } else if (activeTab === "unassigned") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        return (!s || !s.assigned_to) && (!s || s.status !== "closed");
      });
    } else if (activeTab === "closed") {
      result = result.filter((c) => statuses[c.chat_id]?.status === "closed");
    } else {
      // "all" — exclude closed unless searching
      if (!search.trim()) {
        result = result.filter((c) => statuses[c.chat_id]?.status !== "closed");
      }
    }

    // Un-snooze: filter out snoozed conversations that haven't expired
    if (activeTab !== "closed") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        if (s?.status !== "snoozed") return true;
        return s.snoozed_until ? new Date(s.snoozed_until).getTime() <= Date.now() : true;
      });
    }

    // Sort unread conversations to the top
    result = [...result].sort((a, b) => {
      const aHasUnread = !lastSeen[a.chat_id] || (a.latest_at ? a.latest_at > lastSeen[a.chat_id] : false);
      const bHasUnread = !lastSeen[b.chat_id] || (b.latest_at ? b.latest_at > lastSeen[b.chat_id] : false);
      if (aHasUnread && !bHasUnread) return -1;
      if (!aHasUnread && bHasUnread) return 1;
      return (b.latest_at ?? "").localeCompare(a.latest_at ?? "");
    });

    return result;
  }, [conversations, search, activeTab, statuses, currentUserId, lastSeen]);

  const unassignedCount = conversations.filter((c) => {
    const s = statuses[c.chat_id];
    return (!s || !s.assigned_to) && (!s || s.status !== "closed");
  }).length;

  const mineCount = conversations.filter((c) => {
    const s = statuses[c.chat_id];
    return s?.assigned_to === currentUserId && s?.status !== "closed";
  }).length;

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
              for (const c of conversations) {
                updates[c.chat_id] = now;
                // Fire-and-forget per conversation
                fetch("/api/inbox/seen", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: c.chat_id }),
                });
              }
              setLastSeen((prev) => ({ ...prev, ...updates }));
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
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {([
            { key: "mine" as InboxTab, label: "Mine", count: mineCount },
            { key: "unassigned" as InboxTab, label: "Unassigned", count: unassignedCount },
            { key: "all" as InboxTab, label: "All" },
            { key: "closed" as InboxTab, label: "Closed" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
                  tab.key === "unassigned" ? "bg-amber-500/20 text-amber-400" : "bg-white/10"
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Main layout */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {search ? "No conversations match your search." :
             activeTab === "mine" ? "No conversations assigned to you." :
             activeTab === "unassigned" ? "All conversations are assigned." :
             activeTab === "closed" ? "No closed conversations." :
             "No messages yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[60vh]">
          {/* Conversation list */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto thin-scroll">
              {filtered.map((conv) => {
                const chatDeals = deals[conv.chat_id] ?? [];
                const lastMsg = conv.messages[0];
                const isSelected = selectedChat === conv.chat_id;
                const status = statuses[conv.chat_id];
                const assignee = status?.assigned_to
                  ? teamMembers.find((m) => m.id === status.assigned_to)
                  : null;

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
                    onClick={() => handleSelectChat(conv.chat_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-white/[0.04]"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {hasUnread ? (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" title={`${unreadCount} unread`} />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className={cn(
                        "text-sm truncate",
                        hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground"
                      )}>{conv.group_name}</span>
                      {hasUnread && (
                        <span className="rounded-full bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 shrink-0">
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
            </div>
          </div>

          {/* Message detail + reply */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col">
            {selectedConversation ? (
              <>
                {/* Header with actions */}
                <div className="border-b border-white/5 px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-medium text-foreground">{selectedConversation.group_name}</h2>
                    <div className="flex items-center gap-1">
                      {/* Assign to me (one-click) */}
                      {currentUserId && statuses[selectedConversation.chat_id]?.assigned_to !== currentUserId && (
                        <button
                          onClick={() => handleAssign(selectedConversation.chat_id, currentUserId)}
                          className="h-7 rounded-md bg-white/5 border border-white/10 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 px-2 flex items-center gap-1 transition-colors"
                          title="Assign to me"
                        >
                          <UserPlus className="h-3 w-3" />
                          <span>Me</span>
                        </button>
                      )}
                      {/* Assign dropdown */}
                      <select
                        value={statuses[selectedConversation.chat_id]?.assigned_to ?? ""}
                        onChange={(e) => handleAssign(selectedConversation.chat_id, e.target.value || null)}
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
                          onClick={() => setShowSnooze(showSnooze === selectedConversation.chat_id ? null : selectedConversation.chat_id)}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Snooze"
                        >
                          <AlarmClock className="h-3.5 w-3.5" />
                        </button>
                        {showSnooze === selectedConversation.chat_id && (
                          <div className="absolute right-0 top-8 z-10 rounded-lg border border-white/10 bg-[hsl(var(--background))] p-2 shadow-xl min-w-[140px]">
                            {[
                              { label: "1 hour", hours: 1 },
                              { label: "4 hours", hours: 4 },
                              { label: "Tomorrow 9am", hours: null },
                              { label: "Next week", hours: 168 },
                            ].map((opt) => {
                              const until = opt.hours
                                ? new Date(Date.now() + opt.hours * 3600000).toISOString()
                                : (() => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + 1);
                                    d.setHours(9, 0, 0, 0);
                                    return d.toISOString();
                                  })();
                              return (
                                <button
                                  key={opt.label}
                                  onClick={() => handleStatusChange(selectedConversation.chat_id, "snoozed", until)}
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
                      {statuses[selectedConversation.chat_id]?.status === "closed" ? (
                        <button
                          onClick={() => handleStatusChange(selectedConversation.chat_id, "open")}
                          className="h-7 px-2 flex items-center gap-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" /> Reopen
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(selectedConversation.chat_id, "closed")}
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
                    {(deals[selectedConversation.chat_id] ?? []).map((deal) => (
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
                    {(deals[selectedConversation.chat_id] ?? []).length === 0 && (
                      <span className="text-[10px] text-muted-foreground/40">No linked deals</span>
                    )}
                  </div>
                </div>

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
                  </div>
                </div>
              </>
            ) : (
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
        </div>
      )}
    </div>
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
