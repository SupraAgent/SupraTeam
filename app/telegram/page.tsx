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
  PanelRight,
  Plus,
  Check,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

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

const SNOOZE_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "Tomorrow 9am", hours: -1 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
] as const;

function computeSnoozeUntil(hours: number): string {
  if (hours === -1) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(Date.now() + hours * 3600000).toISOString();
}

const PRESET_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

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

interface TgChatGroup {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  is_collapsed: boolean;
  crm_tg_chat_group_members: { id: string; telegram_chat_id: number; chat_title: string | null }[];
  crm_tg_chat_group_contacts: { id: string; contact_id: string }[];
}

type GroupFilter = "all" | "vip" | "pinned" | "unassigned" | "archived" | `group:${string}`;

// ── Main Component ─────────────────────────────────────────────

export default function TelegramPage() {
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

  // Chat labels
  const [labels, setLabels] = React.useState<Record<string, ChatLabel>>({});
  const [contextMenu, setContextMenu] = React.useState<{
    x: number; y: number; chatId: number; groupName: string; submenu?: "tag" | "snooze";
  } | null>(null);
  const [noteModal, setNoteModal] = React.useState<{ chatId: number; groupName: string } | null>(null);
  const [noteText, setNoteText] = React.useState("");

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
  React.useEffect(() => { statusesRef.current = statuses; }, [statuses]);

  // Snooze picker
  const [showSnooze, setShowSnooze] = React.useState<number | null>(null);
  const snoozeRef = React.useRef<HTMLDivElement>(null);

  // Bot filter
  const [bots, setBots] = React.useState<{ id: string; label: string }[]>([]);
  const [selectedBotId, setSelectedBotId] = React.useState<string>(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("tg_bot_filter") ?? "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored) ? stored : "";
  });

  // Sidebar group filter
  const [groupFilter, setGroupFilter] = React.useState<GroupFilter>("all");

  // Right panel
  const [rightPanelOpen, setRightPanelOpen] = React.useState(() => {
    if (typeof window === "undefined") return true;
    try { return localStorage.getItem("tg-right-panel") !== "false"; } catch { return true; }
  });

  // ── Chat Groups ──────────────────────────────────────────
  const [chatGroups, setChatGroups] = React.useState<TgChatGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = React.useState(true);
  const [addGroupOpen, setAddGroupOpen] = React.useState(false);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  // Drag state for conversations
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragChatId, setDragChatId] = React.useState<number | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = React.useState<string | null>(null);
  const [dropFlashGroupId, setDropFlashGroupId] = React.useState<string | null>(null);

  // Reorder drag
  const [reorderDragIdx, setReorderDragIdx] = React.useState<number | null>(null);
  const [reorderOverIdx, setReorderOverIdx] = React.useState<number | null>(null);

  const fetchGroups = React.useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/telegram/groups");
      if (res.ok) {
        const json = await res.json();
        setChatGroups(json.data ?? []);
      }
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function handleCreateGroup(name: string, color?: string) {
    const res = await fetch("/api/telegram/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to create group"); return; }
    toast.success("Group created");
    setChatGroups((prev) => [...prev, json.data]);
  }

  async function handleDeleteGroup(groupId: string) {
    setChatGroups((prev) => prev.filter((g) => g.id !== groupId));
    const res = await fetch(`/api/telegram/groups?id=${groupId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete group");
      fetchGroups(); // rollback
    } else {
      toast.success("Group deleted");
    }
  }

  async function handleAddChatToGroup(groupId: string, chatId: number, chatTitle: string) {
    const optId = `opt-${Date.now()}`;
    setChatGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, crm_tg_chat_group_members: [...g.crm_tg_chat_group_members, { id: optId, telegram_chat_id: chatId, chat_title: chatTitle }] }
          : g
      )
    );
    const res = await fetch("/api/telegram/groups/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, chat_ids: [chatId], chat_titles: { [chatId]: chatTitle } }),
    });
    if (!res.ok) {
      toast.error("Failed to add to group");
      fetchGroups();
    } else {
      const json = await res.json();
      const realMember = json.data?.[0];
      if (realMember) {
        setChatGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, crm_tg_chat_group_members: g.crm_tg_chat_group_members.map((m) => m.id === optId ? { ...m, id: realMember.id } : m) }
              : g
          )
        );
      }
      toast.success("Added to group");
    }
  }

  async function handleRemoveChatFromGroup(groupId: string, chatId: number) {
    setChatGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, crm_tg_chat_group_members: g.crm_tg_chat_group_members.filter((m) => m.telegram_chat_id !== chatId) }
          : g
      )
    );
    const res = await fetch(`/api/telegram/groups/members?group_id=${groupId}&chat_id=${chatId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove from group");
      fetchGroups();
    }
  }

  function toggleGroupCollapsed(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function handleConvDragStart(e: React.DragEvent, chatId: number, chatTitle: string) {
    e.dataTransfer.setData("application/x-tg-chat-id", String(chatId));
    e.dataTransfer.setData("application/x-tg-chat-title", chatTitle);
    e.dataTransfer.effectAllowed = "copy";
    setIsDragging(true);
    setDragChatId(chatId);
  }

  function handleConvDragEnd() {
    setIsDragging(false);
    setDragChatId(null);
    setDropTargetGroupId(null);
  }

  function handleGroupDragOver(e: React.DragEvent, groupId: string) {
    if (!e.dataTransfer.types.includes("application/x-tg-chat-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTargetGroupId(groupId);
  }

  function handleGroupDragLeave() {
    setDropTargetGroupId(null);
  }

  function handleGroupDrop(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    setDropTargetGroupId(null);
    const chatId = Number(e.dataTransfer.getData("application/x-tg-chat-id"));
    const chatTitle = e.dataTransfer.getData("application/x-tg-chat-title");
    if (!chatId) return;
    // Check if already in group
    const group = chatGroups.find((g) => g.id === groupId);
    if (group?.crm_tg_chat_group_members.some((m) => m.telegram_chat_id === chatId)) {
      toast("Already in this group");
      return;
    }
    handleAddChatToGroup(groupId, chatId, chatTitle);
    setDropFlashGroupId(groupId);
    setTimeout(() => setDropFlashGroupId(null), 600);
  }

  React.useEffect(() => {
    fetch("/api/bots").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.bots) setBots(d.bots.map((b: { id: string; label: string }) => ({ id: b.id, label: b.label })));
    }).catch(() => {});
  }, []);

  // ── Data Fetching ──────────────────────────────────────────

  const fetchInbox = React.useCallback(async () => {
    try {
      const url = selectedBotId ? `/api/inbox?bot_id=${encodeURIComponent(selectedBotId)}` : "/api/inbox";
      const results = await Promise.allSettled([
        fetch(url),
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

  const supabaseRef = React.useRef(createClient());

  // Get current user ID + team members
  React.useEffect(() => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
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

  const fetchInboxRef = React.useRef(fetchInbox);
  fetchInboxRef.current = fetchInbox;

  // Supabase realtime
  React.useEffect(() => {
    const supabase = supabaseRef.current;
    if (!supabase) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("tg-messages")
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

            const currentStatus = statusesRef.current[chatId];
            if (currentStatus?.status === "closed") {
              setStatuses((prev) => ({
                ...prev,
                [chatId]: { ...prev[chatId], status: "open" as const, closed_at: null } as InboxStatus,
              }));
              fetch("/api/inbox/status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, status: "open" }),
              }).catch(() => {});
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
    setLastSeen((prev) => ({ ...prev, [chatId]: new Date().toISOString() }));
    fetch("/api/inbox/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
    }).catch(() => {});
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
        if (replyTextareaRef.current) replyTextareaRef.current.style.height = "auto";
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
        if (selectedChat) {
          setConversations((latest) => {
            const conv = latest.find((c) => c.chat_id === selectedChat);
            if (conv) updateLabel(selectedChat, conv.group_name, { last_user_message_at: new Date().toISOString() });
            return latest;
          });
        }
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
        body: JSON.stringify({ chat_id: chatId, status, snoozed_until: snoozedUntil ?? null }),
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
      toast.error("Network error");
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
      toast.error("Network error");
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

  React.useEffect(() => {
    if (!contextMenu) return;
    function handleClick() { setContextMenu(null); }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu]);

  function insertCannedResponse(response: CannedResponse) {
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
    text = text.replace(/\{\{[^}]+\}\}/g, "");
    setReplyText(text);
    setShowCanned(false);
    setCannedSearch("");
    fetch("/api/inbox/canned", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: response.id, increment_usage: true }),
    }).catch(() => {});
  }

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

  // ── Filtering ──────────────────────────────────────────────

  const filtered = React.useMemo(() => {
    let result = conversations;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
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

    // Group filter from sidebar
    if (groupFilter.startsWith("group:")) {
      const gid = groupFilter.slice(6);
      const group = chatGroups.find((g) => g.id === gid);
      const memberChatIds = new Set(group?.crm_tg_chat_group_members.map((m) => m.telegram_chat_id) ?? []);
      result = result.filter((c) => memberChatIds.has(c.chat_id));
    } else if (groupFilter === "vip") {
      result = result.filter((c) => getLabel(c.chat_id)?.is_vip && !getLabel(c.chat_id)?.is_archived);
    } else if (groupFilter === "pinned") {
      result = result.filter((c) => getLabel(c.chat_id)?.is_pinned && !getLabel(c.chat_id)?.is_archived);
    } else if (groupFilter === "unassigned") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        return (!s || !s.assigned_to) && (!s || s.status !== "closed") && !getLabel(c.chat_id)?.is_archived;
      });
    } else if (groupFilter === "archived") {
      result = result.filter((c) => getLabel(c.chat_id)?.is_archived);
    } else {
      // "all" — exclude archived
      result = result.filter((c) => !getLabel(c.chat_id)?.is_archived);
    }

    // Un-snooze filter
    if (groupFilter !== "archived") {
      result = result.filter((c) => {
        const s = statuses[c.chat_id];
        if (s?.status !== "snoozed") return true;
        return s.snoozed_until ? new Date(s.snoozed_until).getTime() <= Date.now() : true;
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, search, groupFilter, statuses, currentUserId, lastSeen, labels, chatGroups]);

  // Counts for sidebar (single pass)
  const { unreadTotal, vipCount, pinnedCount, unassignedCount, archivedCount } = React.useMemo(() => {
    let unread = 0, vip = 0, pinned = 0, unassigned = 0, archived = 0;
    for (const c of conversations) {
      const l = getLabel(c.chat_id);
      const s = statuses[c.chat_id];
      const seenAt = lastSeen[c.chat_id];
      if (!seenAt || (c.latest_at ? c.latest_at > seenAt : false)) unread++;
      if (l?.is_archived) { archived++; continue; }
      if (l?.is_vip) vip++;
      if (l?.is_pinned) pinned++;
      if ((!s || !s.assigned_to) && (!s || s.status !== "closed")) unassigned++;
    }
    return { unreadTotal: unread, vipCount: vip, pinnedCount: pinned, unassignedCount: unassigned, archivedCount: archived };
  }, [conversations, labels, statuses, lastSeen]);

  const selectedConversation = React.useMemo(
    () => selectedChat ? conversations.find((c) => c.chat_id === selectedChat) ?? null : null,
    [conversations, selectedChat]
  );

  const filteredCanned = React.useMemo(() =>
    cannedSearch.trim()
      ? cannedResponses.filter((r) =>
          r.title.toLowerCase().includes(cannedSearch.toLowerCase()) ||
          (r.shortcut && r.shortcut.toLowerCase().includes(cannedSearch.toLowerCase()))
        )
      : cannedResponses,
    [cannedResponses, cannedSearch]
  );

  const tagCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of conversations) {
      const tag = getLabel(c.chat_id)?.color_tag;
      if (tag) counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
  }, [conversations, labels]);

  // Unique group types for sidebar
  function toggleRightPanel() {
    setRightPanelOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("tg-right-panel", String(next)); } catch { /* noop */ }
      return next;
    });
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] md:h-screen">
        <div className="w-44 border-r border-white/10 p-3 shrink-0 hidden lg:block" style={{ backgroundColor: "hsl(var(--surface-1))" }}>
          <div className="h-4 w-24 rounded bg-white/5 animate-pulse mb-4" />
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-7 rounded bg-white/5 animate-pulse" />)}
          </div>
        </div>
        <div className="w-80 border-r border-white/10 p-3 shrink-0">
          <div className="h-4 w-20 rounded bg-white/5 animate-pulse mb-3" />
          <div className="space-y-2">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />)}
          </div>
        </div>
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Bot selector tabs (if multiple bots) */}
      {bots.length > 1 && (
        <div className="flex items-center border-b border-white/10 shrink-0 px-1" style={{ backgroundColor: "hsl(var(--surface-1))" }}>
          <button
            onClick={() => { setSelectedBotId(""); localStorage.setItem("tg_bot_filter", ""); setLoading(true); }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
              !selectedBotId
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
            )}
          >
            {!selectedBotId && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />}
            <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold bg-white/10 text-muted-foreground">A</span>
            All Bots
          </button>
          {bots.map((bot) => (
            <button
              key={bot.id}
              onClick={() => { setSelectedBotId(bot.id); localStorage.setItem("tg_bot_filter", bot.id); setLoading(true); }}
              className={cn(
                "group relative flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                selectedBotId === bot.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
              )}
            >
              {selectedBotId === bot.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
              <span className={cn(
                "shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold",
                selectedBotId === bot.id ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground"
              )}>
                {bot.label.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{bot.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Groups sidebar (like Email label sidebar) ──────── */}
        <div
          className="w-44 border-r border-white/10 py-3 px-2 shrink-0 overflow-y-auto thin-scroll hidden lg:block"
          style={{ backgroundColor: "hsl(var(--surface-1))" }}
        >
          <div className="mb-3">
            <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Chats</p>
            <SidebarItem
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              label="All Chats"
              count={unreadTotal}
              active={groupFilter === "all"}
              onClick={() => { setGroupFilter("all"); setSelectedChat(null); }}
            />
            <SidebarItem
              icon={<Star className="h-3.5 w-3.5" />}
              label="VIP"
              count={vipCount}
              active={groupFilter === "vip"}
              onClick={() => { setGroupFilter("vip"); setSelectedChat(null); }}
            />
            <SidebarItem
              icon={<Pin className="h-3.5 w-3.5" />}
              label="Pinned"
              count={pinnedCount}
              active={groupFilter === "pinned"}
              onClick={() => { setGroupFilter("pinned"); setSelectedChat(null); }}
            />
            <SidebarItem
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label="Unassigned"
              count={unassignedCount}
              active={groupFilter === "unassigned"}
              onClick={() => { setGroupFilter("unassigned"); setSelectedChat(null); }}
              countColor={unassignedCount > 0 ? "text-amber-400 bg-amber-500/20" : undefined}
            />
            <SidebarItem
              icon={<Archive className="h-3.5 w-3.5" />}
              label="Archived"
              count={archivedCount}
              active={groupFilter === "archived"}
              onClick={() => { setGroupFilter("archived"); setSelectedChat(null); }}
            />
          </div>

          {/* ── Groups (drag chats here) ──────────────── */}
          <div className="mt-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Groups</p>
              <div className="relative">
                <button
                  onClick={() => setAddGroupOpen(!addGroupOpen)}
                  className="rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                  title="Create group"
                >
                  <Plus className="h-3 w-3" />
                </button>
                {addGroupOpen && (
                  <CreateGroupDropdown
                    onCreateGroup={handleCreateGroup}
                    onClose={() => setAddGroupOpen(false)}
                  />
                )}
              </div>
            </div>

            {chatGroups.length === 0 && !groupsLoading ? (
              <p className="px-2 py-2 text-[10px] text-muted-foreground/40">
                {isDragging ? "Drop here to create a group" : "No groups yet — click + to create"}
              </p>
            ) : (
              chatGroups.map((group, idx) => (
                <div
                  key={group.id}
                  draggable
                  onDragStart={(e) => {
                    if (e.dataTransfer.types.includes("application/x-tg-chat-id")) return;
                    e.dataTransfer.setData("application/x-group-reorder", String(idx));
                    e.dataTransfer.effectAllowed = "move";
                    setReorderDragIdx(idx);
                  }}
                  onDragOver={(e) => {
                    // Reorder drag
                    if (e.dataTransfer.types.includes("application/x-group-reorder")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setReorderOverIdx(idx);
                      return;
                    }
                    // Chat drag into group
                    handleGroupDragOver(e, group.id);
                  }}
                  onDragLeave={() => { setReorderOverIdx(null); handleGroupDragLeave(); }}
                  onDrop={(e) => {
                    // Reorder
                    const fromStr = e.dataTransfer.getData("application/x-group-reorder");
                    if (fromStr !== "") {
                      e.preventDefault();
                      const from = Number(fromStr);
                      setChatGroups((prev) => {
                        const next = [...prev];
                        const [item] = next.splice(from, 1);
                        next.splice(idx, 0, item);
                        // Persist reorder to server
                        fetch("/api/telegram/groups", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ order: next.map((g) => g.id) }),
                        }).catch(() => toast.error("Failed to save group order"));
                        return next;
                      });
                      setReorderDragIdx(null);
                      setReorderOverIdx(null);
                      return;
                    }
                    // Chat drop
                    handleGroupDrop(e, group.id);
                  }}
                  onDragEnd={() => { setReorderDragIdx(null); setReorderOverIdx(null); }}
                  className={cn(
                    reorderDragIdx === idx && "opacity-40",
                    reorderOverIdx === idx && reorderDragIdx !== null && reorderDragIdx !== idx && "border-t-2 border-primary",
                  )}
                >
                  <SidebarGroup
                    group={group}
                    isActive={groupFilter === `group:${group.id}`}
                    isCollapsed={collapsedGroups.has(group.id)}
                    isDropTarget={dropTargetGroupId === group.id}
                    isDropFlash={dropFlashGroupId === group.id}
                    conversations={conversations}
                    onToggle={() => toggleGroupCollapsed(group.id)}
                    onClick={() => { setGroupFilter(`group:${group.id}`); setSelectedChat(null); }}
                    onDelete={() => handleDeleteGroup(group.id)}
                    onRemoveMember={(chatId) => handleRemoveChatFromGroup(group.id, chatId)}
                    onSelectChat={handleSelectChat}
                  />
                </div>
              ))
            )}
          </div>

          {/* ── Tags ──────────────────────────────────────── */}
          <div className="mt-3">
            <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
            {COLOR_TAGS.map((tag) => {
              const count = tagCounts[tag.key] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={tag.key}
                  onClick={() => {
                    setSearch(tag.label.toLowerCase());
                    setGroupFilter("all");
                    setSelectedChat(null);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-white/5 transition-colors"
                >
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1 truncate text-left">{tag.label}</span>
                  <span className="text-[10px] text-muted-foreground/50">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Conversation list (like Email thread list) ──────── */}
        <div className={cn(
          "w-full md:w-80 border-r border-white/10 flex flex-col md:shrink-0",
          selectedChat ? "hidden md:flex" : "flex",
          "min-w-0"
        )}>
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-foreground">
                {search ? `Search: ${search}` : groupFilter.startsWith("group:") ? (chatGroups.find((g) => g.id === groupFilter.slice(6))?.name ?? "Group") : groupFilter === "all" ? "All Chats" : groupFilter === "vip" ? "VIP" : groupFilter === "pinned" ? "Pinned" : groupFilter === "unassigned" ? "Unassigned" : "Archived"}
              </h1>
              {unreadTotal > 0 && groupFilter === "all" && !search && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {unreadTotal}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleRightPanel}
                className={cn(
                  "rounded-lg p-1.5 hover:bg-white/5 transition",
                  rightPanelOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                title="Toggle info panel"
              >
                <PanelRight className="h-4 w-4" />
              </button>
              <button
                onClick={async () => {
                  const now = new Date().toISOString();
                  const updates: Record<number, string> = {};
                  for (const c of filtered) updates[c.chat_id] = now;
                  setLastSeen((prev) => ({ ...prev, ...updates }));
                  try {
                    await Promise.all(
                      filtered.map((c) =>
                        fetch("/api/inbox/seen", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ chat_id: c.chat_id }),
                        })
                      )
                    );
                    toast.success("All marked as read");
                  } catch {
                    toast.error("Failed to mark all as read");
                  }
                }}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                title="Mark all as read"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
              <button
                onClick={handleRefresh}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                title="Refresh"
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-3 py-2 border-b border-white/10 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats..."
                className="pl-8 h-8 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto thin-scroll">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <MessageCircle className="h-8 w-8 text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground/50">
                  {search ? "No matching conversations" : "No conversations"}
                </p>
              </div>
            ) : (
              filtered.map((conv) => {
                const lastMsg = conv.messages[0];
                const isSelected = selectedChat === conv.chat_id;
                const status = statuses[conv.chat_id];
                const label = getLabel(conv.chat_id);
                const assignee = status?.assigned_to
                  ? teamMembers.find((m) => m.id === status.assigned_to)
                  : null;
                const colorTag = label?.color_tag ? COLOR_TAGS.find((t) => t.key === label.color_tag) : null;
                const tagColor = colorTag?.color || label?.color_tag_color || null;

                // Unread detection
                const seenAt = lastSeen[conv.chat_id];
                const neverSeen = !seenAt;
                const unreadCount = seenAt
                  ? conv.messages.filter((m) => m.sent_at > seenAt).length +
                    conv.messages.reduce((sum, m) => sum + (m.replies?.filter((r: ThreadMessage) => r.sent_at > seenAt).length ?? 0), 0)
                  : conv.message_count;
                const hasUnread = (unreadCount > 0 || neverSeen) && !isSelected;

                // SLA
                const lastCustomerMsg = conv.messages.find((m) => !m.is_from_bot);
                const slaMs = lastCustomerMsg ? Date.now() - new Date(lastCustomerMsg.sent_at).getTime() : null;
                const slaHours = slaMs ? slaMs / 3600000 : null;
                const slaColor = slaHours === null ? null : slaHours < 1 ? "text-emerald-400" : slaHours < 4 ? "text-amber-400" : "text-red-400";

                return (
                  <button
                    key={conv.chat_id}
                    draggable
                    onDragStart={(e) => handleConvDragStart(e, conv.chat_id, conv.group_name)}
                    onDragEnd={handleConvDragEnd}
                    onClick={() => handleSelectChat(conv.chat_id)}
                    onContextMenu={(e) => handleContextMenu(e, conv.chat_id, conv.group_name)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 transition-colors border-b border-white/5",
                      isSelected
                        ? "bg-primary/10"
                        : label?.is_vip
                          ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]"
                          : "hover:bg-white/[0.04]",
                      label?.is_muted && "opacity-50",
                      dragChatId === conv.chat_id && "opacity-40"
                    )}
                    style={tagColor && !label?.is_vip ? { borderLeftWidth: 3, borderLeftColor: tagColor } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {hasUnread ? (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      {label?.is_vip && <Star className="h-3 w-3 text-amber-400 shrink-0" />}
                      {label?.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                      <span className={cn(
                        "text-sm truncate flex-1",
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
                    </div>

                    {/* Tags */}
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
                      {slaColor && status?.status !== "closed" && (
                        <span className={cn("text-[10px] font-medium", slaColor)}>
                          {slaHours !== null && (slaHours < 1 ? `${Math.round(slaHours * 60)}m` : `${Math.round(slaHours)}h`)}
                        </span>
                      )}
                      {assignee && (
                        <span className="text-[10px] text-primary/60 truncate max-w-[80px]">{assignee.display_name}</span>
                      )}
                      {conv.member_count && (
                        <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5 ml-auto">
                          <Users className="h-2.5 w-2.5" />
                          {conv.member_count}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Message detail view (like Email thread view) ──────── */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selectedChat && "hidden md:flex"
        )}>
          {selectedConversation ? (() => {
            const selLabel = getLabel(selectedConversation.chat_id);
            const selChatId = selectedConversation.chat_id;
            const selGroupName = selectedConversation.group_name;
            const selColorTag = selLabel?.color_tag ? COLOR_TAGS.find((t) => t.key === selLabel.color_tag) : null;
            const selTagColor = selColorTag?.color || selLabel?.color_tag_color;
            const chatDeals = deals[selChatId] ?? [];
            return (
              <>
                {/* Header with actions */}
                <div className="border-b border-white/10 px-4 py-3 shrink-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Mobile back button */}
                      <button
                        onClick={() => setSelectedChat(null)}
                        className="md:hidden rounded-lg p-1 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
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
                            {SNOOZE_OPTIONS.map((opt) => (
                              <button
                                key={opt.label}
                                onClick={() => handleStatusChange(selChatId, "snoozed", computeSnoozeUntil(opt.hours))}
                                className="block w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-white/5"
                              >
                                {opt.label}
                              </button>
                            ))}
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
                    {chatDeals.map((deal) => (
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
                    {chatDeals.length === 0 && (
                      <span className="text-[10px] text-muted-foreground/40">No linked deals</span>
                    )}
                  </div>
                </div>

                {/* Note banner */}
                {selLabel?.note && (
                  <div
                    className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500/5 border-b border-yellow-500/10 cursor-pointer hover:bg-yellow-500/10 transition-colors shrink-0"
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
                        <MessageBubble msg={msg} onReply={() => setReplyTo(msg)} />
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
                                  <MessageBubble key={reply.id} msg={reply} compact onReply={() => setReplyTo(reply)} />
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
                <div className="border-t border-white/10 px-4 py-3 shrink-0">
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
                          e.target.style.height = "auto";
                          e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                        }}
                        onKeyDown={(e) => {
                          if (showCanned && filteredCanned.length > 0) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setCannedIndex((i) => Math.min(i + 1, filteredCanned.length - 1));
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
                    <button
                      onClick={() => setSendAs(sendAs === "user" ? "bot" : "user")}
                      className={cn(
                        "h-[38px] w-[38px] flex items-center justify-center rounded-lg border border-white/10 transition-colors shrink-0",
                        sendAs === "bot" ? "bg-primary/10 text-primary" : "bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                      title={sendAs === "bot" ? "Sending as Bot" : "Sending as You"}
                    >
                      {sendAs === "bot" ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                    </button>
                    <Button
                      size="sm"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      className="h-[38px] px-3 shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            );
          })() : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <TelegramIcon className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a conversation to read</p>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
                <span className="text-muted-foreground/50">Right-click a conversation for quick actions</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel — Chat info ──────────────────────────── */}
        {rightPanelOpen && selectedConversation && (
          <div
            className="w-72 border-l border-white/10 shrink-0 overflow-y-auto thin-scroll hidden xl:block"
            style={{ backgroundColor: "hsl(var(--surface-1))" }}
          >
            <div className="p-4 space-y-4">
              {/* Group info */}
              <div>
                <h3 className="text-xs font-semibold text-foreground mb-2">Group Info</h3>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="text-foreground font-medium truncate ml-2">{selectedConversation.group_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-foreground capitalize">{selectedConversation.group_type}</span>
                  </div>
                  {selectedConversation.member_count && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Members</span>
                      <span className="text-foreground">{selectedConversation.member_count}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Messages</span>
                    <span className="text-foreground">{selectedConversation.message_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className={cn(
                      "text-foreground capitalize",
                      statuses[selectedConversation.chat_id]?.status === "closed" && "text-muted-foreground",
                      statuses[selectedConversation.chat_id]?.status === "snoozed" && "text-cyan-400",
                    )}>
                      {statuses[selectedConversation.chat_id]?.status ?? "open"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Linked deals */}
              <div>
                <h3 className="text-xs font-semibold text-foreground mb-2">Linked Deals</h3>
                {(deals[selectedConversation.chat_id] ?? []).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/40">No linked deals</p>
                ) : (
                  <div className="space-y-1.5">
                    {(deals[selectedConversation.chat_id] ?? []).map((deal) => (
                      <a
                        key={deal.id}
                        href={`/pipeline?highlight=${deal.id}`}
                        className="block rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 hover:bg-white/5 transition-colors"
                      >
                        <p className="text-xs text-foreground font-medium truncate">{deal.deal_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {deal.stage && (
                            <span className="text-[10px] text-muted-foreground">{(deal.stage as { name: string }).name}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground/50">{deal.board_type}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Assignment */}
              {(() => {
                const status = statuses[selectedConversation.chat_id];
                const assignee = status?.assigned_to
                  ? teamMembers.find((m) => m.id === status.assigned_to)
                  : null;
                return (
                  <div>
                    <h3 className="text-xs font-semibold text-foreground mb-2">Assignment</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {assignee ? assignee.display_name : "Unassigned"}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

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
            </>
          )}

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

          {contextMenu.submenu === "snooze" && (
            <>
              <CtxItem
                icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Back"
                onClick={() => setContextMenu({ ...contextMenu, submenu: undefined })}
              />
              <div className="border-t border-white/10 my-1" />
              {SNOOZE_OPTIONS.map((opt) => (
                <CtxItem
                  key={opt.label}
                  icon={<AlarmClock className="h-3.5 w-3.5" />}
                  label={opt.label}
                  onClick={() => { handleStatusChange(contextMenu.chatId, "snoozed", computeSnoozeUntil(opt.hours)); setContextMenu(null); }}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Note Modal ─────────────────────────────────────── */}
      {noteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onClick={() => setNoteModal(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setNoteModal(null); }}
          ref={(el) => el?.focus()}
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
    </div>
  );
}

// ── Sidebar Item ─────────────────────────────────────────────

function SidebarItem({ icon, label, count, active, onClick, countColor }: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  countColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
          countColor || (active ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground")
        )}>
          {count}
        </span>
      )}
    </button>
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

// ── Sidebar Group (collapsible, drop target) ────────────────

function SidebarGroup({
  group,
  isActive,
  isCollapsed,
  isDropTarget,
  isDropFlash,
  conversations,
  onToggle,
  onClick,
  onDelete,
  onRemoveMember,
  onSelectChat,
}: {
  group: TgChatGroup;
  isActive: boolean;
  isCollapsed: boolean;
  isDropTarget: boolean;
  isDropFlash: boolean;
  conversations: Conversation[];
  onToggle: () => void;
  onClick: () => void;
  onDelete: () => void;
  onRemoveMember: (chatId: number) => void;
  onSelectChat: (chatId: number) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const memberCount = group.crm_tg_chat_group_members.length;

  return (
    <div className="border-b border-white/5">
      {confirmDelete ? (
        <div className="px-2 py-2 bg-red-500/10">
          <p className="text-[10px] text-red-400 mb-1.5">Delete &ldquo;{group.name}&rdquo;?</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="rounded-md px-2 py-1 text-[10px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2 py-1 text-[10px] font-medium bg-white/5 text-muted-foreground hover:bg-white/10 transition"
            >
              No
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 transition-colors group/grp rounded-md cursor-grab",
              isDropFlash
                ? "bg-green-500/20 ring-1 ring-inset ring-green-500/40"
                : isDropTarget
                  ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
                  : isActive
                    ? "bg-primary/10"
                    : "hover:bg-white/[0.03]"
            )}
          >
            <button onClick={onToggle} className="shrink-0 text-muted-foreground hover:text-foreground transition">
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
            <button
              onClick={onClick}
              className={cn(
                "flex-1 text-left text-xs font-medium truncate transition",
                isActive ? "text-primary" : "text-foreground hover:text-primary"
              )}
            >
              {group.name}
            </button>
            {memberCount > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">{memberCount}</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="opacity-0 group-hover/grp:opacity-100 shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
              title="Delete group"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>

          {!isCollapsed && (
            <div className="px-1 pb-1 space-y-0.5">
              {group.crm_tg_chat_group_members.length === 0 ? (
                <p className="px-2 py-2 text-[10px] text-muted-foreground/40 text-center">
                  Drag chats here
                </p>
              ) : (
                group.crm_tg_chat_group_members.map((member) => {
                  const conv = conversations.find((c) => c.chat_id === member.telegram_chat_id);
                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors group/member"
                    >
                      <MessageCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                      <button
                        onClick={() => onSelectChat(member.telegram_chat_id)}
                        className="flex-1 text-left text-[11px] text-foreground/80 truncate hover:text-primary transition"
                      >
                        {member.chat_title || conv?.group_name || `Chat ${member.telegram_chat_id}`}
                      </button>
                      <button
                        onClick={() => onRemoveMember(member.telegram_chat_id)}
                        className="opacity-0 group-hover/member:opacity-100 shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-400 transition"
                        title="Remove from group"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Create Group Dropdown ────────────────────────────────────

function CreateGroupDropdown({
  onCreateGroup,
  onClose,
}: {
  onCreateGroup: (name: string, color?: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#3b82f6");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("click", handle), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", handle); };
  }, [onClose]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreateGroup(name.trim(), color);
      setName("");
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-[100] w-52 rounded-lg border border-white/10 shadow-2xl py-2 px-2"
      style={{ backgroundColor: "hsl(var(--surface-3))" }}
    >
      <p className="text-[10px] font-medium text-muted-foreground mb-1.5 px-0.5">New Group</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        placeholder="Group name..."
        className="w-full rounded-md px-2 py-1.5 text-xs bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 mb-2"
        autoFocus
      />
      <div className="flex items-center gap-1 mb-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              "h-4 w-4 rounded-full transition-all",
              color === c ? "ring-2 ring-white/40 scale-110" : "hover:scale-110"
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button
        onClick={handleCreate}
        disabled={creating || !name.trim()}
        className="w-full flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-30"
      >
        {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Create Group
      </button>
    </div>
  );
}

// ── Telegram Icon (paper plane) ──────────────────────────────

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
