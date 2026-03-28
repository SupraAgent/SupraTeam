"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Dialog = {
  id: string;
  type: "private" | "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  unreadCount: number;
  lastMessage?: { text: string; date: number; senderName?: string };
  telegramId: number;
  accessHash?: string;
  isCrmLinked: boolean;
};

type Message = {
  id: number;
  text: string;
  date: number;
  senderId?: number;
  senderName?: string;
  replyToId?: number;
  mediaType?: string;
};

type ChatLabel = {
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
};

type DealStageInfo = {
  telegram_chat_id: number;
  deal_name: string;
  stage_name: string;
  stage_position: number;
};

type TypeTab = "all" | "private" | "group" | "channel";
type ViewFilter = "inbox" | "vip" | "unread" | "archived";

/* ------------------------------------------------------------------ */
/*  Color tag presets                                                  */
/* ------------------------------------------------------------------ */

const COLOR_TAGS = [
  { key: "hot_lead", label: "Hot Lead", color: "#ef4444" },
  { key: "partner", label: "Partner", color: "#3b82f6" },
  { key: "investor", label: "Investor", color: "#8b5cf6" },
  { key: "vip_client", label: "VIP Client", color: "#f59e0b" },
  { key: "urgent", label: "Urgent", color: "#f97316" },
  { key: "follow_up", label: "Follow Up", color: "#06b6d4" },
] as const;

/* ------------------------------------------------------------------ */
/*  Snooze presets                                                     */
/* ------------------------------------------------------------------ */

const SNOOZE_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "Tomorrow 9am", hours: -1 }, // special
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
] as const;

function getSnoozeUntil(hours: number): string {
  if (hours === -1) {
    // Tomorrow 9am
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ConversationsPage() {
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [dialogs, setDialogs] = React.useState<Dialog[]>([]);
  const [activeDialog, setActiveDialog] = React.useState<Dialog | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [messageText, setMessageText] = React.useState("");
  const [typeTab, setTypeTab] = React.useState<TypeTab>("all");
  const [viewFilter, setViewFilter] = React.useState<ViewFilter>("inbox");
  const [search, setSearch] = React.useState("");
  const [loadingDialogs, setLoadingDialogs] = React.useState(false);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [labels, setLabels] = React.useState<Record<string, ChatLabel>>({});
  const [dealStages, setDealStages] = React.useState<Record<string, DealStageInfo>>({});
  const [contextMenu, setContextMenu] = React.useState<{
    x: number; y: number; dialog: Dialog; submenu?: "tag" | "snooze";
  } | null>(null);
  const [bulkMode, setBulkMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [noteDialog, setNoteDialog] = React.useState<Dialog | null>(null);
  const [noteText, setNoteText] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    checkConnection();
  }, []);

  React.useEffect(() => {
    if (connected) {
      fetchLabels();
      fetchDealStages();
    }
  }, [connected]);

  React.useEffect(() => {
    if (connected) fetchDialogs();
  }, [connected, typeTab]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Re-evaluate expired snoozes every 60s
  React.useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      fetchLabels();
    }, 60_000);
    return () => clearInterval(interval);
  }, [connected]);

  React.useEffect(() => {
    function handleClick() { setContextMenu(null); }
    if (contextMenu) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  /* ---- Data fetching ---- */

  async function checkConnection() {
    try {
      const res = await fetch("/api/telegram-client/status");
      const data = await res.json();
      setConnected(data.connected);
    } catch {
      setConnected(false);
    }
  }

  async function fetchDialogs() {
    setLoadingDialogs(true);
    setError("");
    try {
      const typeParam = typeTab === "all" ? "" : `&type=${typeTab}`;
      const res = await fetch(`/api/telegram-client/conversations?limit=100${typeParam}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load conversations"); return; }
      setDialogs(data.data || []);
    } finally {
      setLoadingDialogs(false);
    }
  }

  async function fetchLabels() {
    try {
      const res = await fetch("/api/chat-labels");
      const data = await res.json();
      if (res.ok) setLabels(data.data || {});
    } catch { /* optional */ }
  }

  async function fetchDealStages() {
    try {
      const res = await fetch("/api/deals?include_stage=1&limit=500");
      const data = await res.json();
      if (!res.ok) return;
      const map: Record<string, DealStageInfo> = {};
      for (const deal of data.data || []) {
        if (deal.telegram_chat_id) {
          map[String(deal.telegram_chat_id)] = {
            telegram_chat_id: deal.telegram_chat_id,
            deal_name: deal.name || deal.company,
            stage_name: deal.stage_name || deal.pipeline_stage?.name || "",
            stage_position: deal.stage_position || deal.pipeline_stage?.position || 0,
          };
        }
      }
      setDealStages(map);
    } catch { /* optional */ }
  }

  /* ---- Label mutations ---- */

  async function updateLabel(dialog: Dialog, updates: Partial<ChatLabel>) {
    const key = String(dialog.telegramId);
    const prev = labels[key];

    // Optimistic update
    setLabels((p) => ({
      ...p,
      [key]: { ...emptyLabel(dialog.telegramId), ...p[key], ...updates },
    }));

    try {
      const res = await fetch("/api/chat-labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: dialog.telegramId,
          chat_title: dialog.title,
          chat_type: dialog.type,
          ...updates,
        }),
      });
      if (!res.ok) {
        // Rollback on server error
        setLabels((p) => prev ? { ...p, [key]: prev } : (() => { const next = { ...p }; delete next[key]; return next; })());
      }
    } catch {
      setLabels((p) => prev ? { ...p, [key]: prev } : (() => { const next = { ...p }; delete next[key]; return next; })());
    }
  }

  function toggleLabel(dialog: Dialog, field: "is_vip" | "is_archived" | "is_pinned" | "is_muted") {
    const current = labels[String(dialog.telegramId)];
    updateLabel(dialog, { [field]: !(current?.[field] ?? false) } as Partial<ChatLabel>);
  }

  function setColorTag(dialog: Dialog, tag: string | null, color: string | null) {
    updateLabel(dialog, { color_tag: tag, color_tag_color: color });
  }

  function snoozeChat(dialog: Dialog, hours: number) {
    updateLabel(dialog, { snoozed_until: getSnoozeUntil(hours) });
  }

  function unsnooze(dialog: Dialog) {
    updateLabel(dialog, { snoozed_until: null });
  }

  function saveNote(dialog: Dialog, text: string) {
    updateLabel(dialog, { note: text || null });
  }

  /* ---- Bulk actions ---- */

  function toggleSelected(telegramId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(telegramId)) next.delete(telegramId);
      else next.add(telegramId);
      return next;
    });
  }

  async function bulkAction(updates: Record<string, unknown>) {
    const ids = [...selectedIds];
    if (!ids.length) return;

    const snapshot = { ...labels };

    // Optimistic merge
    setLabels((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const key = String(id);
        next[key] = { ...emptyLabel(id), ...next[key], ...updates } as ChatLabel;
      }
      return next;
    });

    try {
      const res = await fetch("/api/chat-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_ids: ids, updates }),
      });
      if (!res.ok) setLabels(snapshot);
    } catch { setLabels(snapshot); }

    setSelectedIds(new Set());
    setBulkMode(false);
  }

  /* ---- Message handling ---- */

  async function openDialog(dialog: Dialog) {
    if (bulkMode) { toggleSelected(dialog.telegramId); return; }
    setActiveDialog(dialog);
    setLoadingMessages(true);
    setMessages([]);
    try {
      const peerType = dialog.type === "private" ? "user" : dialog.type === "group" ? "chat" : "channel";
      const params = new URLSearchParams({ type: peerType, id: String(dialog.telegramId), limit: "50" });
      if (dialog.accessHash) params.set("accessHash", dialog.accessHash);
      const res = await fetch(`/api/telegram-client/messages?${params}`);
      const data = await res.json();
      if (res.ok) setMessages((data.data || []).reverse());
    } finally { setLoadingMessages(false); }
  }

  async function handleSend() {
    if (!messageText.trim() || !activeDialog) return;
    setSending(true);
    try {
      const peerType = activeDialog.type === "private" ? "user" : activeDialog.type === "group" ? "chat" : "channel";
      const res = await fetch("/api/telegram-client/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: peerType,
          id: String(activeDialog.telegramId),
          accessHash: activeDialog.accessHash,
          message: messageText.trim(),
        }),
      });
      if (res.ok) {
        setMessageText("");
        // Track last user message time via proper rollback-aware path
        updateLabel(activeDialog, { last_user_message_at: new Date().toISOString() });
        openDialog(activeDialog);
      }
    } finally { setSending(false); }
  }

  /* ---- Helpers ---- */

  function getLabel(dialog: Dialog): ChatLabel | undefined {
    return labels[String(dialog.telegramId)];
  }

  function getDealStage(dialog: Dialog): DealStageInfo | undefined {
    return dealStages[String(dialog.telegramId)];
  }

  function isSnoozed(dialog: Dialog): boolean {
    const l = getLabel(dialog);
    return !!l?.snoozed_until && new Date(l.snoozed_until) > new Date();
  }

  /* ---- Filtering & sorting ---- */

  const processedDialogs = React.useMemo(() => {
    let list = dialogs;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        getLabel(d)?.note?.toLowerCase().includes(q) ||
        getLabel(d)?.color_tag?.toLowerCase().includes(q)
      );
    }

    switch (viewFilter) {
      case "vip":
        list = list.filter((d) => getLabel(d)?.is_vip || d.isCrmLinked);
        break;
      case "unread":
        list = list.filter((d) => d.unreadCount > 0);
        break;
      case "archived":
        list = list.filter((d) => getLabel(d)?.is_archived);
        break;
      default: // inbox — exclude archived and snoozed
        list = list.filter((d) => !getLabel(d)?.is_archived && !isSnoozed(d));
        break;
    }

    return [...list].sort((a, b) => {
      const aPin = getLabel(a)?.is_pinned ? 1 : 0;
      const bPin = getLabel(b)?.is_pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      const aDate = a.lastMessage?.date || 0;
      const bDate = b.lastMessage?.date || 0;
      return bDate - aDate;
    });
  }, [dialogs, search, viewFilter, labels]);

  const vipCount = React.useMemo(
    () => dialogs.filter((d) => getLabel(d)?.is_vip || d.isCrmLinked).length,
    [dialogs, labels]
  );
  const unreadCount = React.useMemo(
    () => dialogs.filter((d) => d.unreadCount > 0).length,
    [dialogs]
  );
  const archivedCount = React.useMemo(
    () => dialogs.filter((d) => getLabel(d)?.is_archived).length,
    [dialogs, labels]
  );
  const snoozedCount = React.useMemo(
    () => dialogs.filter((d) => isSnoozed(d)).length,
    [dialogs, labels]
  );

  function handleContextMenu(e: React.MouseEvent, dialog: Dialog) {
    e.preventDefault();
    // Clamp to viewport so menu doesn't overflow off-screen
    const menuW = 200;
    const menuH = 300;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setContextMenu({ x, y, dialog });
  }

  /* ---- Render: not connected ---- */

  if (connected === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Conversations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Connect your Telegram account to view conversations.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center space-y-4">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-[#2AABEE]/10">
            <TelegramIcon className="h-6 w-6 text-[#2AABEE]" />
          </div>
          <p className="text-sm text-muted-foreground">Your Telegram account is not connected.</p>
          <a href="/settings/integrations/connect" className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium h-9 px-3 hover:brightness-110 transition-all">
            Connect Telegram
          </a>
        </div>
      </div>
    );
  }

  if (connected === null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-foreground">Conversations</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  /* ---- Render: connected ---- */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Conversations</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            DMs are fetched live and never stored. CRM-linked group messages are synced.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk mode toggle */}
          <Button
            size="sm"
            variant={bulkMode ? "default" : "ghost"}
            onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
          >
            <CheckboxIcon className="h-3.5 w-3.5 mr-1" />
            {bulkMode ? "Done" : "Select"}
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchDialogs} disabled={loadingDialogs}>
            <RefreshIcon className={`h-3.5 w-3.5 mr-1 ${loadingDialogs ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 flex-wrap">
          <span className="text-xs font-medium text-foreground">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_vip: true })}>
            <StarIcon className="h-3 w-3 mr-1 text-amber-400" /> VIP
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_vip: false })}>
            Un-VIP
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_pinned: true })}>
            <PinIcon className="h-3 w-3 mr-1" /> Pin
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_pinned: false })}>
            Unpin
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_muted: true })}>
            <MuteIcon className="h-3 w-3 mr-1" /> Mute
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_muted: false })}>
            Unmute
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_archived: true })}>
            <ArchiveIcon className="h-3 w-3 mr-1" /> Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkAction({ is_archived: false })}>
            Unarchive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* ============ Dialog list ============ */}
        <div className="w-[340px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.035] flex flex-col overflow-hidden">
          {/* View filter row */}
          <div className="flex border-b border-white/10">
            {([
              { key: "inbox" as const, label: "Inbox", count: undefined as number | undefined, icon: null },
              { key: "vip" as const, label: "VIP", count: vipCount, icon: <StarIcon className="h-3 w-3" /> },
              { key: "unread" as const, label: "Unread", count: unreadCount, icon: <UnreadIcon className="h-3 w-3" /> },
              { key: "archived" as const, label: "Archived", count: archivedCount, icon: <ArchiveIcon className="h-3 w-3" /> },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setViewFilter(f.key)}
                className={`flex-1 py-2 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                  viewFilter === f.key
                    ? f.key === "vip"
                      ? "text-amber-400 border-b-2 border-amber-400"
                      : f.key === "unread"
                        ? "text-blue-400 border-b-2 border-blue-400"
                        : "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.icon}
                {f.label}
                {f.count !== undefined && f.count > 0 && (
                  <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    f.key === "vip" ? "bg-amber-500/20 text-amber-400" :
                    f.key === "unread" ? "bg-blue-500/20 text-blue-400" :
                    "bg-white/10 text-muted-foreground"
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Type tabs */}
          <div className="flex border-b border-white/10 text-xs">
            {(["all", "private", "group", "channel"] as TypeTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeTab(t)}
                className={`flex-1 py-2 font-medium transition-colors capitalize ${
                  typeTab === t ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "private" ? "DMs" : t}
              </button>
            ))}
          </div>

          {/* Search + snoozed indicator */}
          <div className="p-2 space-y-1">
            <Input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="text-xs h-8" />
            {snoozedCount > 0 && viewFilter === "inbox" && (
              <button
                onClick={async () => {
                  const snoozedIds = dialogs.filter((d) => isSnoozed(d)).map((d) => d.telegramId);
                  if (!snoozedIds.length) return;
                  // Optimistic
                  setLabels((prev) => {
                    const next = { ...prev };
                    for (const id of snoozedIds) {
                      const key = String(id);
                      if (next[key]) next[key] = { ...next[key], snoozed_until: null };
                    }
                    return next;
                  });
                  try {
                    const res = await fetch("/api/chat-labels", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ chat_ids: snoozedIds, updates: { snoozed_until: null } }),
                    });
                    if (!res.ok) fetchLabels();
                  } catch { fetchLabels(); }
                }}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1"
                title="Click to unsnooze all"
              >
                <SnoozeIcon className="h-3 w-3" />
                {snoozedCount} snoozed — click to show
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto thin-scroll">
            {loadingDialogs && processedDialogs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>
            )}
            {!loadingDialogs && processedDialogs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                {viewFilter === "archived" ? "No archived conversations" :
                 viewFilter === "vip" ? "No VIP conversations" :
                 viewFilter === "unread" ? "No unread conversations" : "No conversations"}
              </p>
            )}
            {processedDialogs.map((d) => {
              const label = getLabel(d);
              const stage = getDealStage(d);
              const isVip = label?.is_vip || d.isCrmLinked;
              const isPinned = label?.is_pinned;
              const isMuted = label?.is_muted;
              const colorTag = label?.color_tag ? COLOR_TAGS.find((t) => t.key === label.color_tag) : null;
              const tagColor = colorTag?.color || label?.color_tag_color || null;
              const isSelected = selectedIds.has(d.telegramId);

              return (
                <button
                  key={d.id}
                  onClick={() => openDialog(d)}
                  onContextMenu={(e) => handleContextMenu(e, d)}
                  className={`w-full text-left px-3 py-2.5 border-b transition-colors ${
                    isSelected ? "bg-primary/10 border-primary/20" :
                    activeDialog?.id === d.id ? "bg-white/10 border-white/10" :
                    isVip ? "bg-amber-500/[0.04] border-amber-500/10 hover:bg-amber-500/[0.08]" :
                    "border-white/5 hover:bg-white/5"
                  } ${isMuted ? "opacity-50" : ""}`}
                  style={tagColor && !isVip ? { borderLeftWidth: 3, borderLeftColor: tagColor } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Bulk checkbox */}
                      {bulkMode && (
                        <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary border-primary" : "border-white/20"
                        }`}>
                          {isSelected && <CheckIcon className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      )}
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                          isVip ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30" :
                          d.type === "private" ? "bg-blue-500/20 text-blue-400" :
                          d.type === "group" || d.type === "supergroup" ? "bg-green-500/20 text-green-400" :
                          "bg-purple-500/20 text-purple-400"
                        }`}>
                          {d.title.charAt(0).toUpperCase()}
                        </div>
                        {isPinned && (
                          <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-card flex items-center justify-center">
                            <PinIcon className="h-2.5 w-2.5 text-primary" />
                          </div>
                        )}
                      </div>
                      {/* Title + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {isVip && <StarIcon className="h-3 w-3 text-amber-400 shrink-0" />}
                          <p className={`text-xs font-medium truncate ${isVip ? "text-amber-200" : "text-foreground"}`}>
                            {d.title}
                          </p>
                          {d.isCrmLinked && <span className="text-[10px] text-primary shrink-0">CRM</span>}
                        </div>
                        {/* Color tag + deal stage */}
                        <div className="flex items-center gap-1 mt-0.5">
                          {colorTag && (
                            <span className="rounded px-1 py-0 text-[9px] font-medium" style={{ backgroundColor: `${tagColor}20`, color: tagColor || undefined }}>
                              {colorTag.label}
                            </span>
                          )}
                          {stage && (
                            <span className="rounded px-1 py-0 text-[9px] font-medium bg-primary/10 text-primary">
                              {stage.stage_name}
                            </span>
                          )}
                          {label?.note && (
                            <NoteIcon className="h-2.5 w-2.5 text-yellow-500/60 shrink-0" />
                          )}
                        </div>
                        {/* Last message preview */}
                        {d.lastMessage && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {d.lastMessage.senderName && `${d.lastMessage.senderName}: `}
                            {d.lastMessage.text}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Right side: time + unread + last contacted */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                      {d.lastMessage && (
                        <span className="text-[10px] text-muted-foreground">{formatTime(d.lastMessage.date)}</span>
                      )}
                      {d.unreadCount > 0 && !isMuted && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          isVip ? "bg-amber-500 text-black" : "bg-primary text-primary-foreground"
                        }`}>{d.unreadCount}</span>
                      )}
                      {d.unreadCount > 0 && isMuted && (
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{d.unreadCount}</span>
                      )}
                      {/* Last contacted indicator */}
                      {label?.last_user_message_at && (
                        <span className="text-[9px] text-muted-foreground/60">
                          You: {timeAgo(label.last_user_message_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ============ Message view ============ */}
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.035] flex flex-col overflow-hidden">
          {!activeDialog ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Header with actions */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getLabel(activeDialog)?.is_vip && <StarIcon className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    <p className="text-sm font-medium text-foreground truncate">{activeDialog.title}</p>
                    {/* Color tag in header */}
                    {(() => {
                      const l = getLabel(activeDialog);
                      const ct = l?.color_tag ? COLOR_TAGS.find((t) => t.key === l.color_tag) : null;
                      const tc = ct?.color || l?.color_tag_color;
                      if (!ct) return null;
                      return (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0" style={{ backgroundColor: `${tc}20`, color: tc || undefined }}>
                          {ct.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted-foreground">
                      {activeDialog.type === "private" ? "Private chat" :
                       activeDialog.type === "group" ? "Group" :
                       activeDialog.type === "supergroup" ? "Supergroup" : "Channel"}
                      {activeDialog.username && ` · @${activeDialog.username}`}
                      {activeDialog.isCrmLinked && " · CRM-linked"}
                    </p>
                    {/* Deal stage badge in header */}
                    {getDealStage(activeDialog) && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">
                        {getDealStage(activeDialog)!.stage_name}
                      </span>
                    )}
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconButton
                    onClick={() => toggleLabel(activeDialog, "is_vip")}
                    active={getLabel(activeDialog)?.is_vip}
                    activeColor="text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                    title={getLabel(activeDialog)?.is_vip ? "Remove VIP" : "Mark as VIP"}
                  >
                    <StarIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    onClick={() => toggleLabel(activeDialog, "is_pinned")}
                    active={getLabel(activeDialog)?.is_pinned}
                    activeColor="text-primary bg-primary/10 hover:bg-primary/20"
                    title={getLabel(activeDialog)?.is_pinned ? "Unpin" : "Pin to top"}
                  >
                    <PinIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    onClick={() => toggleLabel(activeDialog, "is_muted")}
                    active={getLabel(activeDialog)?.is_muted}
                    title={getLabel(activeDialog)?.is_muted ? "Unmute" : "Mute"}
                  >
                    <MuteIcon className="h-4 w-4" muted={getLabel(activeDialog)?.is_muted} />
                  </IconButton>
                  <IconButton
                    onClick={() => {
                      setNoteDialog(activeDialog);
                      setNoteText(getLabel(activeDialog)?.note || "");
                    }}
                    active={!!getLabel(activeDialog)?.note}
                    activeColor="text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20"
                    title="Notes"
                  >
                    <NoteIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    onClick={() => toggleLabel(activeDialog, "is_archived")}
                    active={getLabel(activeDialog)?.is_archived}
                    title={getLabel(activeDialog)?.is_archived ? "Unarchive" : "Archive"}
                  >
                    <ArchiveIcon className="h-4 w-4" />
                  </IconButton>
                </div>
                {activeDialog.type === "private" && (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 shrink-0">
                    Live only — not stored
                  </span>
                )}
              </div>

              {/* Note banner */}
              {getLabel(activeDialog)?.note && (
                <div
                  className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500/5 border-b border-yellow-500/10 cursor-pointer hover:bg-yellow-500/10 transition-colors"
                  onClick={() => {
                    setNoteDialog(activeDialog);
                    setNoteText(getLabel(activeDialog)?.note || "");
                  }}
                >
                  <NoteIcon className="h-3 w-3 text-yellow-500/60 shrink-0" />
                  <p className="text-[11px] text-yellow-200/80 truncate">{getLabel(activeDialog)!.note}</p>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-2">
                {loadingMessages && (
                  <p className="text-xs text-muted-foreground text-center py-8">Loading messages...</p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className="group">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground shrink-0">{m.senderName || "Unknown"}</span>
                      <span className="text-[10px] text-muted-foreground">{formatTime(m.date)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                      {m.text || (m.mediaType ? `[${m.mediaType}]` : "[empty]")}
                    </p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div className="border-t border-white/10 p-3">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                  />
                  <Button size="sm" onClick={handleSend} disabled={sending || !messageText.trim()}>
                    {sending ? "..." : "Send"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ============ Context menu ============ */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-card shadow-xl py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.submenu && (
            <>
              <CtxItem icon={<StarIcon className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.dialog)?.is_vip ? "Remove VIP" : "Mark as VIP"}
                active={getLabel(contextMenu.dialog)?.is_vip} activeColor="text-amber-400"
                onClick={() => { toggleLabel(contextMenu.dialog, "is_vip"); setContextMenu(null); }} />
              <CtxItem icon={<PinIcon className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.dialog)?.is_pinned ? "Unpin" : "Pin to top"}
                active={getLabel(contextMenu.dialog)?.is_pinned}
                onClick={() => { toggleLabel(contextMenu.dialog, "is_pinned"); setContextMenu(null); }} />
              <CtxItem icon={<MuteIcon className="h-3.5 w-3.5" muted={getLabel(contextMenu.dialog)?.is_muted} />}
                label={getLabel(contextMenu.dialog)?.is_muted ? "Unmute" : "Mute"}
                active={getLabel(contextMenu.dialog)?.is_muted}
                onClick={() => { toggleLabel(contextMenu.dialog, "is_muted"); setContextMenu(null); }} />
              <div className="border-t border-white/10 my-1" />
              {/* Tag submenu */}
              <CtxItem icon={<TagIcon className="h-3.5 w-3.5" />} label="Tag as..."
                onClick={() => setContextMenu({ ...contextMenu, submenu: "tag" })} hasArrow />
              {/* Snooze submenu */}
              <CtxItem icon={<SnoozeIcon className="h-3.5 w-3.5" />}
                label={isSnoozed(contextMenu.dialog) ? "Snoozed — click to unsnooze" : "Snooze..."}
                active={isSnoozed(contextMenu.dialog)} activeColor="text-cyan-400"
                onClick={() => {
                  if (isSnoozed(contextMenu.dialog)) { unsnooze(contextMenu.dialog); setContextMenu(null); }
                  else setContextMenu({ ...contextMenu, submenu: "snooze" });
                }}
                hasArrow={!isSnoozed(contextMenu.dialog)} />
              {/* Note */}
              <CtxItem icon={<NoteIcon className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.dialog)?.note ? "Edit note" : "Add note"}
                active={!!getLabel(contextMenu.dialog)?.note} activeColor="text-yellow-400"
                onClick={() => {
                  setNoteDialog(contextMenu.dialog);
                  setNoteText(getLabel(contextMenu.dialog)?.note || "");
                  setContextMenu(null);
                }} />
              <div className="border-t border-white/10 my-1" />
              <CtxItem icon={<ArchiveIcon className="h-3.5 w-3.5" />}
                label={getLabel(contextMenu.dialog)?.is_archived ? "Unarchive" : "Archive"}
                active={getLabel(contextMenu.dialog)?.is_archived}
                onClick={() => { toggleLabel(contextMenu.dialog, "is_archived"); setContextMenu(null); }} />
            </>
          )}

          {/* Tag submenu */}
          {contextMenu.submenu === "tag" && (
            <>
              <CtxItem icon={<ChevronLeftIcon className="h-3.5 w-3.5" />} label="Back"
                onClick={() => setContextMenu({ ...contextMenu, submenu: undefined })} />
              <div className="border-t border-white/10 my-1" />
              {COLOR_TAGS.map((t) => (
                <CtxItem key={t.key}
                  icon={<div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />}
                  label={t.label}
                  active={getLabel(contextMenu.dialog)?.color_tag === t.key}
                  onClick={() => {
                    const current = getLabel(contextMenu.dialog)?.color_tag;
                    setColorTag(contextMenu.dialog, current === t.key ? null : t.key, current === t.key ? null : t.color);
                    setContextMenu(null);
                  }} />
              ))}
              {getLabel(contextMenu.dialog)?.color_tag && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <CtxItem icon={<XIcon className="h-3.5 w-3.5" />} label="Remove tag"
                    onClick={() => { setColorTag(contextMenu.dialog, null, null); setContextMenu(null); }} />
                </>
              )}
            </>
          )}

          {/* Snooze submenu */}
          {contextMenu.submenu === "snooze" && (
            <>
              <CtxItem icon={<ChevronLeftIcon className="h-3.5 w-3.5" />} label="Back"
                onClick={() => setContextMenu({ ...contextMenu, submenu: undefined })} />
              <div className="border-t border-white/10 my-1" />
              {SNOOZE_OPTIONS.map((opt) => (
                <CtxItem key={opt.label} icon={<SnoozeIcon className="h-3.5 w-3.5" />} label={opt.label}
                  onClick={() => { snoozeChat(contextMenu.dialog, opt.hours); setContextMenu(null); }} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ============ Note modal ============ */}
      {noteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setNoteDialog(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setNoteDialog(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Note — {noteDialog.title}</h3>
              <button onClick={() => setNoteDialog(null)} className="text-muted-foreground hover:text-foreground">
                <XIcon className="h-4 w-4" />
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
              {getLabel(noteDialog)?.note && (
                <Button size="sm" variant="ghost" onClick={() => { saveNote(noteDialog, ""); setNoteDialog(null); }}>
                  Delete note
                </Button>
              )}
              <Button size="sm" onClick={() => { saveNote(noteDialog, noteText); setNoteDialog(null); }}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared small components                                            */
/* ------------------------------------------------------------------ */

function IconButton({ children, onClick, active, activeColor, title }: {
  children: React.ReactNode; onClick: () => void; active?: boolean; activeColor?: string; title: string;
}) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`p-1.5 rounded-md transition-colors ${
        active ? (activeColor || "text-foreground bg-white/10 hover:bg-white/15") : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      }`}>
      {children}
    </button>
  );
}

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
      {hasArrow && <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyLabel(telegramId: number): ChatLabel {
  return {
    id: "", telegram_chat_id: telegramId,
    is_vip: false, is_archived: false, is_pinned: false, is_muted: false,
    color_tag: null, color_tag_color: null, note: null,
    snoozed_until: null, last_user_message_at: null, last_contact_message_at: null,
  };
}

function formatTime(unix: number): string {
  const d = new Date(unix * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function MuteIcon({ className, muted }: { className?: string; muted?: boolean }) {
  if (muted) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function SnoozeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h6l-6 8h6" />
      <path d="M14 12h8l-8 10h8" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function UnreadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function CheckboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
