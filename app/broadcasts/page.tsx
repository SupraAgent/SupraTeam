"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Tag,
  Users,
  Check,
  X,
  MessageCircle,
  Clock,
  History,
  Eye,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Calendar,
  Ban,
  FileText,
  Sparkles,
} from "lucide-react";
import { MERGE_VARIABLES } from "@/lib/telegram-templates";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type TgGroup = {
  id: string;
  group_name: string;
  telegram_group_id: string;
  bot_is_admin: boolean;
  member_count: number | null;
  slugs: string[];
};

type BroadcastResult = {
  group_name: string;
  success: boolean;
  error?: string;
};

type BroadcastRecipient = {
  id: string;
  group_name: string;
  status: string;
  error: string | null;
  sent_at: string | null;
};

type Broadcast = {
  id: string;
  message_text: string;
  sender_name: string | null;
  slug_filter: string | null;
  group_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  recipients: BroadcastRecipient[];
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  sent: { color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckCircle, label: "Sent" },
  failed: { color: "text-red-400", bg: "bg-red-500/10", icon: XCircle, label: "Failed" },
  scheduled: { color: "text-blue-400", bg: "bg-blue-500/10", icon: Calendar, label: "Scheduled" },
  sending: { color: "text-yellow-400", bg: "bg-yellow-500/10", icon: Send, label: "Sending" },
  cancelled: { color: "text-muted-foreground", bg: "bg-white/5", icon: Ban, label: "Cancelled" },
  draft: { color: "text-muted-foreground", bg: "bg-white/5", icon: MessageCircle, label: "Draft" },
};

export default function BroadcastsPage() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<string>>(new Set());
  const [sending, setSending] = React.useState(false);
  const [results, setResults] = React.useState<BroadcastResult[] | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const [scheduleMode, setScheduleMode] = React.useState(false);
  const [scheduleDate, setScheduleDate] = React.useState("");
  const [scheduleTime, setScheduleTime] = React.useState("");

  // History
  const [broadcasts, setBroadcasts] = React.useState<Broadcast[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [expandedBroadcast, setExpandedBroadcast] = React.useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // Templates
  type BotTemplate = { id: string; template_key: string; name: string; body_template: string; category: string | null };
  const [templates, setTemplates] = React.useState<BotTemplate[]>([]);
  const [showTemplates, setShowTemplates] = React.useState(false);

  // Formatting helpers
  const [cursorPos, setCursorPos] = React.useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/groups").then((r) => r.json()).catch(() => ({ groups: [] })),
      fetch("/api/groups/slugs").then((r) => r.json()).catch(() => ({ slugs: [] })),
      fetch("/api/bot/templates").then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([groupsData, slugsData, tplData]) => {
        setTemplates((tplData.data ?? []).filter((t: BotTemplate) => t.category === "broadcast" || t.category === "custom"));
        const slugMap: Record<string, string[]> = {};
        for (const s of slugsData.slugs ?? []) {
          if (!slugMap[s.group_id]) slugMap[s.group_id] = [];
          slugMap[s.group_id].push(s.slug);
        }
        setGroups(
          (groupsData.groups ?? []).map((g: TgGroup) => ({
            ...g,
            slugs: slugMap[g.id] ?? [],
          }))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const allSlugs = [...new Set(groups.flatMap((g) => g.slugs))].sort();

  const filteredGroups = selectedSlug
    ? groups.filter((g) => g.slugs.includes(selectedSlug))
    : groups;

  React.useEffect(() => {
    if (selectedSlug) {
      const matching = groups.filter((g) => g.slugs.includes(selectedSlug));
      setSelectedGroupIds(new Set(matching.map((g) => g.id)));
    } else {
      setSelectedGroupIds(new Set());
    }
  }, [selectedSlug, groups]);

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function insertFormatting(tag: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = message.slice(start, end);
    const wrapped = `<${tag}>${selected}</${tag}>`;
    setMessage(message.slice(0, start) + wrapped + message.slice(end));
    setTimeout(() => {
      ta.focus();
      const newPos = selected ? start + wrapped.length : start + tag.length + 2;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/broadcasts");
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data.broadcasts ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSend() {
    if (!message.trim() || selectedGroupIds.size === 0) return;
    setSending(true);
    setResults(null);
    try {
      const body: Record<string, unknown> = {
        message: message.trim(),
        group_ids: [...selectedGroupIds],
        slug: selectedSlug ?? undefined,
      };

      if (scheduleMode && scheduleDate && scheduleTime) {
        body.scheduled_at = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      }

      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.scheduled) {
          toast.success(`Broadcast scheduled for ${scheduleDate} ${scheduleTime}`);
          setMessage("");
          setScheduleMode(false);
          setScheduleDate("");
          setScheduleTime("");
        } else {
          setResults(data.results);
          toast.success(`Sent to ${data.sent}/${data.total} groups`);
          if (data.sent === data.total) setMessage("");
        }
        // Refresh history if visible
        if (showHistory) fetchHistory();
      } else {
        toast.error(data.error ?? "Failed to send");
      }
    } finally {
      setSending(false);
    }
  }

  async function cancelBroadcast(id: string) {
    const res = await fetch("/api/broadcasts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setBroadcasts((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b))
      );
      toast.success("Broadcast cancelled");
    }
  }

  function reuseMessage(text: string) {
    setMessage(text);
    setShowHistory(false);
    toast.success("Message loaded into compose");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Broadcasts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send messages to Telegram groups. Filter by slug for targeted broadcasts.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setShowHistory(!showHistory);
            if (!showHistory && broadcasts.length === 0) fetchHistory();
          }}
        >
          <History className="mr-1 h-3.5 w-3.5" />
          {showHistory ? "Compose" : "History"}
        </Button>
      </div>

      {/* History view */}
      {showHistory ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Broadcast History</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchHistory}
              disabled={historyLoading}
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </Button>
          </div>

          {broadcasts.length === 0 && !historyLoading && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
              <History className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                No broadcasts sent yet.
              </p>
            </div>
          )}

          {broadcasts.map((b) => {
            const cfg = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.draft;
            const Icon = cfg.icon;
            const isExpanded = expandedBroadcast === b.id;

            return (
              <div
                key={b.id}
                className="rounded-xl border border-white/10 bg-white/[0.035] overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedBroadcast(isExpanded ? null : b.id)
                  }
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      cfg.bg
                    )}
                  >
                    <Icon className={cn("h-4 w-4", cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {b.message_text.length > 80
                        ? b.message_text.slice(0, 80) + "..."
                        : b.message_text}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span className={cfg.color}>{cfg.label}</span>
                      {b.sender_name && <span>by {b.sender_name}</span>}
                      {b.slug_filter && (
                        <span className="rounded bg-primary/10 text-primary px-1 py-0.5">
                          {b.slug_filter}
                        </span>
                      )}
                      <span>
                        {b.sent_count}/{b.group_count} groups
                      </span>
                      <span>
                        {b.sent_at
                          ? timeAgo(b.sent_at)
                          : b.scheduled_at
                            ? `Scheduled: ${new Date(b.scheduled_at).toLocaleString()}`
                            : timeAgo(b.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.status === "scheduled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelBroadcast(b.id);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        reuseMessage(b.message_text);
                      }}
                    >
                      Reuse
                    </Button>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/5 px-4 py-3 space-y-2">
                    <div className="rounded-lg bg-white/[0.02] p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                      {b.message_text}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Recipients
                      </p>
                      {b.recipients?.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between py-1 border-b border-white/5 last:border-0"
                        >
                          <span className="text-xs text-foreground">
                            {r.group_name}
                          </span>
                          {r.status === "sent" ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <Check className="h-3 w-3" /> Sent{" "}
                              {r.sent_at && timeAgo(r.sent_at)}
                            </span>
                          ) : r.status === "failed" ? (
                            <span
                              className="flex items-center gap-1 text-[10px] text-red-400"
                              title={r.error ?? ""}
                            >
                              <X className="h-3 w-3" /> Failed
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              Pending
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Compose view */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Compose */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Compose Message
                </h2>
                {templates.length > 0 && (
                  <button
                    onClick={() => setShowTemplates(!showTemplates)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      showTemplates ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    <FileText className="h-3 w-3" />
                    Templates
                  </button>
                )}
              </div>

              {/* Template picker */}
              {showTemplates && (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground px-2 py-1">
                    Pick a template to use as your message body
                  </p>
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setMessage(tpl.body_template);
                        setShowTemplates(false);
                        toast.success(`Template "${tpl.name}" loaded`);
                      }}
                      className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                      <p className="text-xs font-medium text-foreground">{tpl.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                        {tpl.body_template.slice(0, 80)}
                        {tpl.body_template.length > 80 ? "..." : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* Merge variable chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
                {[...MERGE_VARIABLES.contact.slice(0, 4), ...MERGE_VARIABLES.deal.slice(0, 2), ...MERGE_VARIABLES.sender].map((v) => (
                  <button
                    key={v.key}
                    onClick={() => {
                      const ta = textareaRef.current;
                      if (!ta) return;
                      const pos = ta.selectionStart;
                      const token = `{{${v.key}}}`;
                      setMessage(message.slice(0, pos) + token + message.slice(pos));
                      setTimeout(() => {
                        ta.focus();
                        ta.setSelectionRange(pos + token.length, pos + token.length);
                      }, 0);
                    }}
                    className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                    title={v.hint}
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>

              {/* Formatting toolbar */}
              <div className="flex items-center gap-1 border-b border-white/5 pb-2">
                <button
                  onClick={() => insertFormatting("b")}
                  className="rounded px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
                >
                  B
                </button>
                <button
                  onClick={() => insertFormatting("i")}
                  className="rounded px-2 py-1 text-xs italic text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
                >
                  I
                </button>
                <button
                  onClick={() => insertFormatting("u")}
                  className="rounded px-2 py-1 text-xs underline text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
                >
                  U
                </button>
                <button
                  onClick={() => insertFormatting("code")}
                  className="rounded px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
                >
                  {"</>"}
                </button>
                <div className="h-4 w-px bg-white/10 mx-1" />
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className={cn(
                    "rounded px-2 py-1 text-xs flex items-center gap-1 transition",
                    showPreview
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </button>
              </div>

              {showPreview ? (
                <div className="min-h-[160px] rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">
                    Telegram Preview
                  </p>
                  <div
                    className="text-sm text-foreground whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: message
                        .replace(/</g, "&lt;")
                        .replace(/&lt;b&gt;/g, "<b>")
                        .replace(/&lt;\/b&gt;/g, "</b>")
                        .replace(/&lt;i&gt;/g, "<i>")
                        .replace(/&lt;\/i&gt;/g, "</i>")
                        .replace(/&lt;u&gt;/g, "<u>")
                        .replace(/&lt;\/u&gt;/g, "</u>")
                        .replace(/&lt;code&gt;/g, '<code class="bg-white/10 px-1 rounded">')
                        .replace(/&lt;\/code&gt;/g, "</code>"),
                    }}
                  />
                </div>
              ) : (
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onSelect={(e) =>
                    setCursorPos((e.target as HTMLTextAreaElement).selectionStart)
                  }
                  placeholder="Type your broadcast message...&#10;&#10;Formatting: <b>bold</b>, <i>italic</i>, <u>underline</u>, <code>code</code>"
                  className="min-h-[160px] font-mono text-sm"
                />
              )}

              {/* Schedule toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setScheduleMode(!scheduleMode)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    scheduleMode
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  {scheduleMode ? "Scheduled" : "Schedule for later"}
                </button>

                {scheduleMode && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="h-8 w-28 text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {message.length} chars | {selectedGroupIds.size} group
                  {selectedGroupIds.size !== 1 ? "s" : ""} selected
                </p>
                <Button
                  onClick={handleSend}
                  disabled={
                    sending ||
                    !message.trim() ||
                    selectedGroupIds.size === 0 ||
                    (scheduleMode && (!scheduleDate || !scheduleTime))
                  }
                >
                  {scheduleMode ? (
                    <>
                      <Clock className="mr-1 h-3.5 w-3.5" />
                      Schedule
                    </>
                  ) : (
                    <>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      {sending
                        ? "Sending..."
                        : `Send to ${selectedGroupIds.size} group${selectedGroupIds.size !== 1 ? "s" : ""}`}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Results */}
            {results && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-2">
                <h2 className="text-sm font-medium text-foreground">
                  Delivery Results
                </h2>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
                  >
                    <span className="text-xs text-foreground">{r.group_name}</span>
                    {r.success ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3 w-3" /> Sent
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-xs text-red-400"
                        title={r.error}
                      >
                        <X className="h-3 w-3" /> Failed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Group selection */}
          <div className="space-y-4">
            {/* Slug filter */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Tag className="h-4 w-4 text-purple-400" />
                Filter by Slug
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedSlug(null)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    !selectedSlug
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  All
                </button>
                {allSlugs.map((slug) => (
                  <button
                    key={slug}
                    onClick={() =>
                      setSelectedSlug(selectedSlug === slug ? null : slug)
                    }
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      selectedSlug === slug
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    {slug} (
                    {groups.filter((g) => g.slugs.includes(slug)).length})
                  </button>
                ))}
                {allSlugs.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No slugs defined. Add slugs to groups first.
                  </p>
                )}
              </div>
            </div>

            {/* Group list */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-400" />
                  Groups ({filteredGroups.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setSelectedGroupIds(
                        new Set(filteredGroups.map((g) => g.id))
                      )
                    }
                    className="text-xs text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setSelectedGroupIds(new Set())}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    None
                  </button>
                </div>
              </div>

              <div className="space-y-1 max-h-[400px] overflow-y-auto thin-scroll">
                {filteredGroups.map((group) => (
                  <label
                    key={group.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition",
                      selectedGroupIds.has(group.id)
                        ? "bg-white/[0.06]"
                        : "hover:bg-white/[0.03]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.has(group.id)}
                      onChange={() => toggleGroup(group.id)}
                      className="rounded border-white/20"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {group.group_name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {group.slugs.map((s) => (
                          <span
                            key={s}
                            className="text-[9px] text-primary bg-primary/10 rounded px-1 py-0.5"
                          >
                            {s}
                          </span>
                        ))}
                        {group.member_count != null && (
                          <span className="text-[9px] text-muted-foreground">
                            {group.member_count} members
                          </span>
                        )}
                      </div>
                    </div>
                    {!group.bot_is_admin && (
                      <span className="text-[9px] text-red-400">Not admin</span>
                    )}
                  </label>
                ))}

                {filteredGroups.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No groups available. Connect groups in Telegram Settings
                    first.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
