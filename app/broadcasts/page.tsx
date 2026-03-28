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
  BarChart3,
  TrendingUp,
  TrendingDown,
  Search,
  AlertTriangle,
  Save,
} from "lucide-react";
import { MERGE_VARIABLES, TEMPLATE_FILTERS } from "@/lib/telegram-templates";
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

  // Analytics
  type AnalyticsData = {
    overview: { totalBroadcasts: number; totalSent: number; totalFailed: number; deliveryRate: number; thisWeek: number; lastWeek: number; weeklyChange: number };
    byStatus: Record<string, number>;
    slugStats: { slug: string; count: number; sent: number; failed: number; deliveryRate: number }[];
    senderStats: { name: string; count: number }[];
    dailyVolume: { date: string; count: number }[];
  };
  const [analytics, setAnalytics] = React.useState<AnalyticsData | null>(null);
  const [showAnalytics, setShowAnalytics] = React.useState(false);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);

  // Templates
  type BotTemplate = { id: string; template_key: string; name: string; body_template: string; category: string | null };
  const [templates, setTemplates] = React.useState<BotTemplate[]>([]);
  const [showTemplates, setShowTemplates] = React.useState(false);

  // Send confirmation
  const [showConfirm, setShowConfirm] = React.useState(false);

  // History filtering
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = React.useState<string | null>(null);

  // Multi-slug targeting
  const [selectedSlugs, setSelectedSlugs] = React.useState<Set<string>>(new Set());
  const [slugMode, setSlugMode] = React.useState<"any" | "all">("any");

  // Formatting helpers
  const [cursorPos, setCursorPos] = React.useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Draft auto-save
  React.useEffect(() => {
    const saved = localStorage.getItem("broadcast_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.message) setMessage(draft.message);
        if (draft.scheduleDate) { setScheduleDate(draft.scheduleDate); setScheduleMode(true); }
        if (draft.scheduleTime) setScheduleTime(draft.scheduleTime);
      } catch {}
    }
  }, []);

  React.useEffect(() => {
    if (message.trim()) {
      localStorage.setItem("broadcast_draft", JSON.stringify({
        message, scheduleDate, scheduleTime,
      }));
    } else {
      localStorage.removeItem("broadcast_draft");
    }
  }, [message, scheduleDate, scheduleTime]);

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

  const filteredGroups = React.useMemo(() => {
    if (selectedSlugs.size === 0 && !selectedSlug) return groups;
    const activeSlugs = selectedSlugs.size > 0 ? selectedSlugs : selectedSlug ? new Set([selectedSlug]) : new Set<string>();
    if (activeSlugs.size === 0) return groups;
    return groups.filter((g) => {
      if (slugMode === "all") return [...activeSlugs].every((s) => g.slugs.includes(s));
      return [...activeSlugs].some((s) => g.slugs.includes(s));
    });
  }, [groups, selectedSlug, selectedSlugs, slugMode]);

  // Total recipient count (sum of member_count across selected groups)
  const totalRecipients = React.useMemo(() => {
    return groups
      .filter((g) => selectedGroupIds.has(g.id))
      .reduce((sum, g) => sum + (g.member_count ?? 0), 0);
  }, [groups, selectedGroupIds]);

  // Filtered history
  const filteredBroadcasts = React.useMemo(() => {
    let result = broadcasts;
    if (historySearch) {
      const q = historySearch.toLowerCase();
      result = result.filter((b) =>
        b.message_text.toLowerCase().includes(q) ||
        b.sender_name?.toLowerCase().includes(q) ||
        b.slug_filter?.toLowerCase().includes(q)
      );
    }
    if (historyStatusFilter) {
      result = result.filter((b) => b.status === historyStatusFilter);
    }
    return result;
  }, [broadcasts, historySearch, historyStatusFilter]);

  React.useEffect(() => {
    if (selectedSlug) {
      const matching = groups.filter((g) => g.slugs.includes(selectedSlug));
      setSelectedGroupIds(new Set(matching.map((g) => g.id)));
    } else if (selectedSlugs.size > 0) {
      const matching = filteredGroups;
      setSelectedGroupIds(new Set(matching.map((g) => g.id)));
    } else {
      setSelectedGroupIds(new Set());
    }
  }, [selectedSlug, selectedSlugs, slugMode, groups, filteredGroups]);

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

  async function fetchAnalytics() {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/broadcasts/analytics");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } finally {
      setAnalyticsLoading(false);
    }
  }

  function requestSend() {
    if (!message.trim() || selectedGroupIds.size === 0) return;
    setShowConfirm(true);
  }

  async function handleSend() {
    setShowConfirm(false);
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
        localStorage.removeItem("broadcast_draft");
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
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowAnalytics(!showAnalytics);
              setShowHistory(false);
              if (!showAnalytics && !analytics) fetchAnalytics();
            }}
          >
            <BarChart3 className="mr-1 h-3.5 w-3.5" />
            {showAnalytics ? "Compose" : "Analytics"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowHistory(!showHistory);
              setShowAnalytics(false);
              if (!showHistory && broadcasts.length === 0) fetchHistory();
            }}
          >
            <History className="mr-1 h-3.5 w-3.5" />
            {showHistory ? "Compose" : "History"}
          </Button>
        </div>
      </div>

      {/* Analytics view */}
      {showAnalytics ? (
        <div className="space-y-4">
          {analyticsLoading || !analytics ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white/[0.02] animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Broadcasts</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{analytics.overview.totalBroadcasts}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivery Rate</p>
                  <p className={cn("text-2xl font-bold mt-1", analytics.overview.deliveryRate >= 90 ? "text-emerald-400" : analytics.overview.deliveryRate >= 70 ? "text-amber-400" : "text-red-400")}>
                    {analytics.overview.deliveryRate}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Messages Sent</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{analytics.overview.totalSent}</p>
                  {analytics.overview.totalFailed > 0 && (
                    <p className="text-[10px] text-red-400 mt-0.5">{analytics.overview.totalFailed} failed</p>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">This Week</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-2xl font-bold text-foreground">{analytics.overview.thisWeek}</p>
                    {analytics.overview.weeklyChange !== 0 && (
                      <span className={cn("flex items-center gap-0.5 text-xs", analytics.overview.weeklyChange >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {analytics.overview.weeklyChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {analytics.overview.weeklyChange >= 0 ? "+" : ""}{analytics.overview.weeklyChange}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Slug performance */}
              {analytics.slugStats.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
                  <h3 className="text-sm font-medium text-foreground">Performance by Slug</h3>
                  <div className="space-y-2">
                    {analytics.slugStats.map((s) => (
                      <div key={s.slug} className="flex items-center gap-3">
                        <span className="text-xs text-foreground font-medium w-28 truncate">{s.slug}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", s.deliveryRate >= 90 ? "bg-emerald-400" : s.deliveryRate >= 70 ? "bg-amber-400" : "bg-red-400")}
                            style={{ width: `${s.deliveryRate}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-20 text-right">
                          {s.sent}/{s.sent + s.failed} ({s.deliveryRate}%)
                        </span>
                        <span className="text-[10px] text-muted-foreground w-16 text-right">
                          {s.count} sends
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sender breakdown */}
              {analytics.senderStats.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
                  <h3 className="text-sm font-medium text-foreground">By Sender</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    {analytics.senderStats.map((s) => (
                      <span key={s.name} className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs">
                        <span className="text-foreground font-medium">{s.name}</span>
                        <span className="text-muted-foreground ml-1.5">{s.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily volume chart (simple bar representation) */}
              {analytics.dailyVolume.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
                  <h3 className="text-sm font-medium text-foreground">Daily Volume (30d)</h3>
                  <div className="flex items-end gap-0.5 h-16">
                    {analytics.dailyVolume.map((d) => {
                      const max = Math.max(...analytics.dailyVolume.map((v) => v.count));
                      const height = max > 0 ? (d.count / max) * 100 : 0;
                      return (
                        <div
                          key={d.date}
                          className="flex-1 bg-primary/40 rounded-t hover:bg-primary/60 transition-colors"
                          style={{ height: `${Math.max(height, 4)}%` }}
                          title={`${d.date}: ${d.count} broadcasts`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>{analytics.dailyVolume[0]?.date}</span>
                    <span>{analytics.dailyVolume[analytics.dailyVolume.length - 1]?.date}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : /* History view */
      showHistory ? (
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

          {/* History search & filters */}
          {broadcasts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search broadcasts..."
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <div className="flex gap-1">
                {["sent", "scheduled", "failed", "cancelled"].map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => setHistoryStatusFilter(historyStatusFilter === s ? null : s)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                        historyStatusFilter === s ? `${cfg.bg} ${cfg.color}` : "text-muted-foreground hover:bg-white/5"
                      )}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
              {(historySearch || historyStatusFilter) && (
                <span className="text-[10px] text-muted-foreground">
                  {filteredBroadcasts.length}/{broadcasts.length}
                </span>
              )}
            </div>
          )}

          {broadcasts.length === 0 && !historyLoading && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
              <History className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                No broadcasts sent yet.
              </p>
            </div>
          )}

          {filteredBroadcasts.map((b) => {
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

              {/* Merge variable picker — categorized + expandable */}
              <MergeVariablePicker
                onInsert={(token) => {
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const pos = ta.selectionStart;
                  setMessage(message.slice(0, pos) + token + message.slice(pos));
                  setTimeout(() => {
                    ta.focus();
                    ta.setSelectionRange(pos + token.length, pos + token.length);
                  }, 0);
                }}
              />

              {/* Formatting toolbar */}
              <div className="flex items-center gap-1 border-b border-white/5 pb-2">
                <button
                  onClick={() => insertFormatting("b")}
                  className="rounded px-3 py-2 min-h-[44px] text-xs font-bold text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
                >
                  B
                </button>
                <button
                  onClick={() => insertFormatting("i")}
                  className="rounded px-3 py-2 min-h-[44px] text-xs italic text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
                >
                  I
                </button>
                <button
                  onClick={() => insertFormatting("u")}
                  className="rounded px-3 py-2 min-h-[44px] text-xs underline text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
                >
                  U
                </button>
                <button
                  onClick={() => insertFormatting("code")}
                  className="rounded px-3 py-2 min-h-[44px] text-xs font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
                >
                  {"</>"}
                </button>
                <div className="h-4 w-px bg-white/10 mx-1" />
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className={cn(
                    "rounded px-3 py-2 min-h-[44px] text-xs flex items-center gap-1.5 transition",
                    showPreview
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
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
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="flex items-center gap-1.5">
                    <span className={cn(
                      message.length > 4096 ? "text-red-400 font-medium" : message.length > 3600 ? "text-amber-400" : ""
                    )}>
                      {message.length.toLocaleString()}/{(4096).toLocaleString()}
                    </span>
                    <span className="text-white/20">|</span>
                    {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""} selected
                  </p>
                  {message.length > 4096 && (
                    <p className="text-[10px] text-red-400 flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> Exceeds Telegram&apos;s 4096 character limit
                    </p>
                  )}
                  {totalRecipients > 0 && (
                    <p className="text-[10px] flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" />
                      ~{totalRecipients.toLocaleString()} total recipients
                    </p>
                  )}
                  {message.trim() && (
                    <p className="text-[10px] text-emerald-400/60 flex items-center gap-1">
                      <Save className="h-2.5 w-2.5" /> Draft auto-saved
                    </p>
                  )}
                </div>
                <Button
                  onClick={requestSend}
                  disabled={
                    sending ||
                    !message.trim() ||
                    message.length > 4096 ||
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
            {/* Slug filter — multi-select */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Tag className="h-4 w-4 text-purple-400" />
                  Target by Slug
                </h2>
                {selectedSlugs.size > 1 && (
                  <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
                    <button
                      onClick={() => setSlugMode("any")}
                      className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors", slugMode === "any" ? "bg-white/10 text-foreground" : "text-muted-foreground")}
                    >
                      Any (OR)
                    </button>
                    <button
                      onClick={() => setSlugMode("all")}
                      className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors", slugMode === "all" ? "bg-white/10 text-foreground" : "text-muted-foreground")}
                    >
                      All (AND)
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => { setSelectedSlug(null); setSelectedSlugs(new Set()); }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    !selectedSlug && selectedSlugs.size === 0
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  All
                </button>
                {allSlugs.map((slug) => {
                  const isActive = selectedSlugs.has(slug) || selectedSlug === slug;
                  return (
                    <button
                      key={slug}
                      onClick={() => {
                        setSelectedSlug(null);
                        setSelectedSlugs((prev) => {
                          const next = new Set(prev);
                          if (next.has(slug)) next.delete(slug);
                          else next.add(slug);
                          return next;
                        });
                      }}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:bg-white/5"
                      )}
                    >
                      {slug} ({groups.filter((g) => g.slugs.includes(slug)).length})
                    </button>
                  );
                })}
                {allSlugs.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No slugs defined. Add slugs to groups first.
                  </p>
                )}
              </div>
              {selectedSlugs.size > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {filteredGroups.length} group{filteredGroups.length !== 1 ? "s" : ""} match{filteredGroups.length === 1 ? "es" : ""} ({slugMode === "any" ? "any" : "all"} of {selectedSlugs.size} slug{selectedSlugs.size !== 1 ? "s" : ""})
                </p>
              )}
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

      {/* Send confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[hsl(225,35%,8%)] p-5 sm:p-6 shadow-xl space-y-4 safe-area-bottom">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Confirm Broadcast</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
              <p className="text-xs text-muted-foreground line-clamp-3">{message}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""}</span>
                {totalRecipients > 0 && <span>~{totalRecipients.toLocaleString()} recipients</span>}
                {scheduleMode && scheduleDate && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{scheduleDate} {scheduleTime}</span>}
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <Button variant="ghost" className="min-h-[44px]" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button className="min-h-[44px]" onClick={handleSend}>
                <Send className="mr-1.5 h-4 w-4" />
                {scheduleMode ? "Confirm Schedule" : "Confirm Send"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Merge Variable Picker (categorized, expandable) ──

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  contact: { label: "Contact", color: "text-blue-400" },
  deal: { label: "Deal", color: "text-emerald-400" },
  sender: { label: "Sender", color: "text-purple-400" },
  group: { label: "Group", color: "text-amber-400" },
  system: { label: "System", color: "text-cyan-400" },
};

function MergeVariablePicker({ onInsert }: { onInsert: (token: string) => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);

  // Quick chips (most used)
  const quickVars = [
    ...MERGE_VARIABLES.contact.slice(0, 3),
    ...MERGE_VARIABLES.deal.slice(0, 2),
    ...MERGE_VARIABLES.sender.slice(0, 1),
  ];

  return (
    <div className="space-y-1.5">
      {/* Quick chips row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
        {quickVars.map((v) => (
          <button
            key={v.key}
            onClick={() => onInsert(`{{${v.key}}}`)}
            className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 min-h-[32px] text-[11px] font-mono text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors cursor-pointer"
            title={v.hint}
          >
            {`{{${v.key}}}`}
          </button>
        ))}
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "rounded-md px-2 py-1 min-h-[32px] text-[11px] font-medium transition-colors flex items-center gap-0.5",
            expanded ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          {expanded ? "Less" : "All Variables"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
        <button
          onClick={() => { setShowFilters(!showFilters); if (!showFilters) setExpanded(false); }}
          className={cn(
            "rounded-md px-2 py-1 min-h-[32px] text-[11px] font-medium transition-colors",
            showFilters ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          Filters
        </button>
      </div>

      {/* Expanded: all categories */}
      {expanded && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 space-y-2">
          {(Object.entries(MERGE_VARIABLES) as [string, readonly { key: string; label: string; hint: string }[]][]).map(([cat, vars]) => {
            const cfg = CATEGORY_LABELS[cat] ?? { label: cat, color: "text-muted-foreground" };
            return (
              <div key={cat}>
                <p className={cn("text-xs font-medium mb-1", cfg.color)}>{cfg.label}</p>
                <div className="flex flex-wrap gap-1">
                  {vars.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => onInsert(`{{${v.key}}}`)}
                      className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 min-h-[32px] text-[11px] font-mono text-foreground hover:bg-white/10 active:bg-white/15 transition-colors"
                      title={v.hint}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="border-t border-white/5 pt-1.5">
            <p className="text-xs text-muted-foreground">
              Conditionals: <code className="text-[11px] bg-white/5 px-1 rounded">{`{{#if var}}...{{/if}}`}</code>{" "}
              <code className="text-[11px] bg-white/5 px-1 rounded">{`{{#unless var}}...{{/unless}}`}</code>{" "}
              <code className="text-[11px] bg-white/5 px-1 rounded">{`{{#ifgt value 1000}}...{{/ifgt}}`}</code>
            </p>
          </div>
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 space-y-1.5">
          <p className="text-xs text-muted-foreground">Transform filters — append with <code className="bg-white/5 px-1 rounded">|</code></p>
          <div className="flex flex-wrap gap-1">
            {TEMPLATE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => onInsert(`|${f.key}`)}
                className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 min-h-[32px] text-[11px] font-mono text-amber-400 hover:bg-amber-500/15 active:bg-amber-500/25 transition-colors"
                title={`${f.hint} — ${f.example}`}
              >
                |{f.key}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60">
            Example: <code className="bg-white/5 px-1 rounded">{`{{contact_name|upper}}`}</code> or <code className="bg-white/5 px-1 rounded">{`{{value|currency}}`}</code>
          </p>
        </div>
      )}
    </div>
  );
}
