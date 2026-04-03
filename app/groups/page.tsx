"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  Users,
  Shield,
  ShieldOff,
  Tag,
  X,
  Plus,
  Check,
  Archive,
  ArchiveRestore,
  Activity,
  ChevronDown,
  AlertTriangle,
  BarChart3,
  TrendingDown,
  TrendingUp,
  Zap,
  FolderSync,
  FolderX,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { GroupDetailPanel } from "@/components/groups/group-detail-panel";
import { toast } from "sonner";
import { useTelegram } from "@/lib/client/telegram-context";
import { useFolderSync } from "@/lib/client/use-folder-sync";

type HealthStatus = "active" | "quiet" | "stale" | "dead" | "unknown";

type MessageHistoryEntry = { date: string; count: number };

type TgGroup = {
  id: string;
  telegram_group_id: string;
  group_name: string;
  group_type: string | null;
  group_url: string | null;
  bot_is_admin: boolean;
  bot_id: string | null;
  member_count: number | null;
  is_archived: boolean;
  archived_at: string | null;
  last_message_at: string | null;
  message_count_7d: number;
  message_count_30d: number;
  health_status: HealthStatus;
  last_bot_check_at: string | null;
  created_at: string;
  updated_at: string;
  slugs: string[];
  message_history: MessageHistoryEntry[];
  auto_archive_enabled: boolean;
};

type BotInfo = {
  id: string;
  label: string;
  bot_username: string | null;
  is_active: boolean;
  is_default: boolean;
  groups_count: number;
};

type SortKey = "name" | "last_active" | "members" | "health";

const HEALTH_CONFIG: Record<
  HealthStatus,
  { color: string; bg: string; border: string; label: string; dot: string }
> = {
  active: {
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    label: "Active",
    dot: "bg-emerald-400",
  },
  quiet: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    label: "Quiet",
    dot: "bg-yellow-400",
  },
  stale: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    label: "Stale",
    dot: "bg-orange-400",
  },
  dead: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "Dead",
    dot: "bg-red-400",
  },
  unknown: {
    color: "text-muted-foreground",
    bg: "bg-white/5",
    border: "border-white/10",
    label: "Unknown",
    dot: "bg-gray-500",
  },
};

const HEALTH_ORDER: Record<HealthStatus, number> = {
  active: 0,
  quiet: 1,
  stale: 2,
  dead: 3,
  unknown: 4,
};

const SPARKLINE_STROKE_COLORS: Record<HealthStatus, string> = {
  active: "#34d399",   // emerald-400
  quiet: "#facc15",    // yellow-400
  stale: "#fb923c",    // orange-400
  dead: "#f87171",     // red-400
  unknown: "#6b7280",  // gray-500
};

function Sparkline({
  data,
  healthStatus,
  width = 80,
  height = 24,
}: {
  data: MessageHistoryEntry[];
  healthStatus: HealthStatus;
  width?: number;
  height?: number;
}) {
  if (!data || data.length === 0) return null;

  const counts = data.map((d) => d.count);
  const maxCount = Math.max(...counts, 1);
  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = counts.map((c, i) => {
    const x = padding + (i / Math.max(counts.length - 1, 1)) * innerW;
    const y = padding + innerH - (c / maxCount) * innerH;
    return `${x},${y}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={SPARKLINE_STROKE_COLORS[healthStatus]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComparisonModal({
  groups,
  onClose,
}: {
  groups: TgGroup[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-3xl sm:mx-4 max-h-[85vh] rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a1a2e] shadow-2xl flex flex-col safe-area-bottom">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Group Comparison ({groups.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
            aria-label="Close comparison"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Comparison table */}
        <div className="overflow-x-auto overflow-y-auto p-4 sm:p-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-white/5">
                <th className="pb-3 pr-4 font-medium">Metric</th>
                {groups.map((g) => (
                  <th key={g.id} className="pb-3 px-3 font-medium text-center">
                    <span className="text-foreground truncate block max-w-[140px]">
                      {g.group_name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {/* Health */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Health</td>
                {groups.map((g) => {
                  const h = HEALTH_CONFIG[g.health_status];
                  return (
                    <td key={g.id} className="py-3 px-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          h.bg, h.border, h.color
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", h.dot)} />
                        {h.label}
                      </span>
                    </td>
                  );
                })}
              </tr>
              {/* Members */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Members</td>
                {groups.map((g) => (
                  <td key={g.id} className="py-3 px-3 text-center text-foreground">
                    {g.member_count ?? "--"}
                  </td>
                ))}
              </tr>
              {/* 7d messages */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Messages (7d)</td>
                {groups.map((g) => (
                  <td key={g.id} className="py-3 px-3 text-center text-foreground">
                    {g.message_count_7d}
                  </td>
                ))}
              </tr>
              {/* 30d messages */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Messages (30d)</td>
                {groups.map((g) => (
                  <td key={g.id} className="py-3 px-3 text-center text-foreground">
                    {g.message_count_30d}
                  </td>
                ))}
              </tr>
              {/* Msgs per member */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Msgs/Member (7d)</td>
                {groups.map((g) => {
                  const ratio = g.member_count && g.member_count > 0 ? (g.message_count_7d / g.member_count).toFixed(1) : "--";
                  return (
                    <td key={g.id} className="py-3 px-3 text-center text-purple-400 font-medium">
                      {ratio}
                    </td>
                  );
                })}
              </tr>
              {/* Weekly Trend */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Weekly Trend</td>
                {groups.map((g) => {
                  if (!g.message_history || g.message_history.length < 14) {
                    return <td key={g.id} className="py-3 px-3 text-center text-muted-foreground/50">--</td>;
                  }
                  const thisWeek = g.message_history.slice(-7).reduce((s, e) => s + e.count, 0);
                  const prevWeek = g.message_history.slice(-14, -7).reduce((s, e) => s + e.count, 0);
                  const trend = prevWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
                  return (
                    <td key={g.id} className={cn("py-3 px-3 text-center font-medium", trend >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {trend >= 0 ? "+" : ""}{trend}%
                    </td>
                  );
                })}
              </tr>
              {/* Engagement Score */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Engagement Score</td>
                {groups.map((g) => {
                  let score = 0;
                  if (g.last_message_at) {
                    const daysSince = (Date.now() - new Date(g.last_message_at).getTime()) / 86400000;
                    if (daysSince < 1) score += 30; else if (daysSince < 3) score += 20; else if (daysSince < 7) score += 10;
                  }
                  if (g.message_count_7d >= 50) score += 25; else if (g.message_count_7d >= 20) score += 18; else if (g.message_count_7d >= 5) score += 10; else if (g.message_count_7d >= 1) score += 5;
                  if (g.message_count_30d >= 200) score += 20; else if (g.message_count_30d >= 50) score += 12; else if (g.message_count_30d >= 10) score += 5;
                  if (g.member_count) { if (g.member_count >= 100) score += 15; else if (g.member_count >= 20) score += 10; else if (g.member_count >= 5) score += 5; }
                  if (g.message_history?.length >= 20) score += 10;
                  score = Math.min(score, 100);
                  return (
                    <td key={g.id} className="py-3 px-3 text-center">
                      <span className={cn("font-semibold", score >= 60 ? "text-emerald-400" : score >= 30 ? "text-amber-400" : "text-red-400")}>
                        {score}/100
                      </span>
                    </td>
                  );
                })}
              </tr>
              {/* Sparkline */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Activity (30d)</td>
                {groups.map((g) => (
                  <td key={g.id} className="py-3 px-3">
                    <div className="flex justify-center">
                      {g.message_history && g.message_history.length > 0 ? (
                        <Sparkline
                          data={g.message_history}
                          healthStatus={g.health_status}
                          width={100}
                          height={28}
                        />
                      ) : (
                        <span className="text-muted-foreground/50">No data</span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
              {/* Slugs */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Slugs</td>
                {groups.map((g) => (
                  <td key={g.id} className="py-3 px-3 text-center">
                    {g.slugs.length > 0 ? (
                      <div className="flex flex-wrap justify-center gap-1">
                        {g.slugs.map((s) => (
                          <span
                            key={s}
                            className="inline-block rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] text-primary"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">--</span>
                    )}
                  </td>
                ))}
              </tr>
              {/* Last message */}
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Last Message</td>
                {groups.map((g) => (
                  <td key={g.id} className="py-3 px-3 text-center text-foreground">
                    {g.last_message_at ? timeAgo(g.last_message_at) : "--"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function GroupsPage() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [bots, setBots] = React.useState<BotInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [slugFilter, setSlugFilter] = React.useState<string | null>(null);
  const [healthFilter, setHealthFilter] = React.useState<HealthStatus | null>(null);
  const [adminFilter, setAdminFilter] = React.useState<boolean | null>(null);
  const [botFilter, setBotFilter] = React.useState<string | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortKey>("name");
  const [addingSlug, setAddingSlug] = React.useState<string | null>(null);
  const [newSlug, setNewSlug] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkSlugInput, setBulkSlugInput] = React.useState("");
  const [bulkAction, setBulkAction] = React.useState<string | null>(null);
  const [refreshingStats, setRefreshingStats] = React.useState(false);
  const [showComparison, setShowComparison] = React.useState(false);
  const [selectedGroup, setSelectedGroup] = React.useState<TgGroup | null>(null);

  const { status: tgStatus } = useTelegram();
  const tgConnected = tgStatus === "connected";
  const folderSync = useFolderSync(tgConnected);

  const botMap = React.useMemo(() => {
    const m: Record<string, BotInfo> = {};
    for (const b of bots) m[b.id] = b;
    return m;
  }, [bots]);

  const fetchGroups = React.useCallback(async () => {
    try {
      const [groupsRes, slugsRes, botsRes] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/groups/slugs"),
        fetch("/api/bots"),
      ]);
      if (botsRes.ok) {
        const botsData = await botsRes.json();
        setBots(botsData.data ?? []);
      }
      if (groupsRes.ok) {
        const data = await groupsRes.json();
        const rawGroups = data.groups ?? [];
        const slugsData = slugsRes.ok ? await slugsRes.json() : { slugs: [] };
        const slugMap: Record<string, string[]> = {};
        for (const s of slugsData.slugs ?? []) {
          if (!slugMap[s.group_id]) slugMap[s.group_id] = [];
          slugMap[s.group_id].push(s.slug);
        }
        setGroups(
          rawGroups.map((g: TgGroup) => ({
            ...g,
            slugs: slugMap[g.id] ?? [],
            bot_id: g.bot_id ?? null,
            is_archived: g.is_archived ?? false,
            message_count_7d: g.message_count_7d ?? 0,
            message_count_30d: g.message_count_30d ?? 0,
            health_status: g.health_status ?? "unknown",
            message_history: g.message_history ?? [],
            auto_archive_enabled: g.auto_archive_enabled ?? false,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  async function refreshStats() {
    setRefreshingStats(true);
    try {
      const res = await fetch("/api/groups/stats");
      if (!res.ok) throw new Error("Failed to refresh stats");
      await fetchGroups();
      toast.success("Stats refreshed");
    } catch {
      toast.error("Failed to refresh stats");
    } finally {
      setRefreshingStats(false);
    }
  }

  async function handleAddSlug(groupId: string) {
    if (!newSlug.trim()) return;
    try {
      const res = await fetch("/api/groups/slugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, slug: newSlug.trim().toLowerCase() }),
      });
      if (!res.ok) throw new Error("Failed to add slug");
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, slugs: [...g.slugs, newSlug.trim().toLowerCase()] }
            : g
        )
      );
      setNewSlug("");
      setAddingSlug(null);
      toast.success("Slug added");
    } catch {
      toast.error("Failed to add slug");
    }
  }

  async function handleRemoveSlug(groupId: string, slug: string) {
    try {
      const res = await fetch("/api/groups/slugs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, slug }),
      });
      if (!res.ok) throw new Error("Failed to remove slug");
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, slugs: g.slugs.filter((s) => s !== slug) } : g
        )
      );
      toast.success("Slug removed");
    } catch {
      toast.error("Failed to remove slug");
    }
  }

  async function handleBulkAction(action: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const body: Record<string, unknown> = { action, group_ids: ids };
    if ((action === "assign_slug" || action === "remove_slug") && bulkSlugInput.trim()) {
      body.slug = bulkSlugInput.trim().toLowerCase();
    }

    try {
      const res = await fetch("/api/groups/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Bulk action failed");
      const data = await res.json();
      toast.success(`${action}: ${data.affected}/${data.total} groups`);
      setSelected(new Set());
      setBulkSlugInput("");
      setBulkAction(null);
      setLoading(true);
      fetchGroups();
    } catch {
      toast.error(`Bulk ${action} failed`);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredActive.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredActive.map((g) => g.id)));
    }
  }

  // All unique slugs
  const allSlugs = [...new Set(groups.flatMap((g) => g.slugs))].sort();

  // Filter & sort
  const activeGroups = groups.filter((g) => !g.is_archived);
  const archivedGroups = groups.filter((g) => g.is_archived);

  const filterFn = (g: TgGroup) => {
    if (slugFilter && !g.slugs.includes(slugFilter)) return false;
    if (healthFilter && g.health_status !== healthFilter) return false;
    if (adminFilter !== null && g.bot_is_admin !== adminFilter) return false;
    if (botFilter && g.bot_id !== botFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        g.group_name.toLowerCase().includes(q) || g.slugs.some((s) => s.includes(q))
      );
    }
    return true;
  };

  const sortFn = (a: TgGroup, b: TgGroup) => {
    switch (sortBy) {
      case "last_active":
        return (
          new Date(b.last_message_at ?? 0).getTime() -
          new Date(a.last_message_at ?? 0).getTime()
        );
      case "members":
        return (b.member_count ?? 0) - (a.member_count ?? 0);
      case "health":
        return HEALTH_ORDER[a.health_status] - HEALTH_ORDER[b.health_status];
      default:
        return a.group_name.localeCompare(b.group_name);
    }
  };

  const filteredActive = activeGroups.filter(filterFn).sort(sortFn);
  const filteredArchived = archivedGroups.filter(filterFn).sort(sortFn);

  // Stats
  const activeCount = activeGroups.filter(
    (g) => g.health_status === "active"
  ).length;
  const staleDeadCount = activeGroups.filter(
    (g) => g.health_status === "stale" || g.health_status === "dead"
  ).length;

  // Compute weekly trends for all groups
  const groupTrends = React.useMemo(() => {
    const trends: Record<string, { trend: number; prevWeek: number; thisWeek: number }> = {};
    for (const g of activeGroups) {
      if (!g.message_history || g.message_history.length < 14) continue;
      const thisWeek = g.message_history.slice(-7).reduce((s, e) => s + e.count, 0);
      const prevWeek = g.message_history.slice(-14, -7).reduce((s, e) => s + e.count, 0);
      const trend = prevWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
      trends[g.id] = { trend, prevWeek, thisWeek };
    }
    return trends;
  }, [activeGroups]);

  // Activity alerts: groups with significant drops or spikes
  const activityAlerts = React.useMemo(() => {
    const declining: TgGroup[] = [];
    const surging: TgGroup[] = [];
    for (const g of activeGroups) {
      const t = groupTrends[g.id];
      if (!t) continue;
      if (t.trend <= -50 && t.prevWeek >= 5) declining.push(g);
      if (t.trend >= 100 && t.thisWeek >= 10) surging.push(g);
    }
    return { declining, surging };
  }, [activeGroups, groupTrends]);

  // Total messages and per-member ratio
  const totalMessages7d = activeGroups.reduce((s, g) => s + g.message_count_7d, 0);
  const totalMembers = activeGroups.reduce((s, g) => s + (g.member_count ?? 0), 0);
  const msgsPerMember = totalMembers > 0 ? (totalMessages7d / totalMembers).toFixed(1) : "0";

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Telegram Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeGroups.length} group{activeGroups.length !== 1 ? "s" : ""} connected
            {archivedGroups.length > 0 && `, ${archivedGroups.length} archived`}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshStats}
            disabled={refreshingStats}
          >
            <Activity
              className={cn("mr-1 h-3.5 w-3.5", refreshingStats && "animate-spin")}
            />
            Refresh Stats
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLoading(true);
              fetchGroups();
            }}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{activeGroups.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Groups</p>
        </div>
        <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-emerald-400">{activeCount}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </div>
        <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-blue-400">{totalMessages7d}</p>
          <p className="text-[10px] text-muted-foreground">Msgs (7d)</p>
        </div>
        <div className="rounded-xl border border-purple-500/10 bg-purple-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-purple-400">{msgsPerMember}</p>
          <p className="text-[10px] text-muted-foreground">Msgs/Member</p>
        </div>
        <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-blue-400">{allSlugs.length}</p>
          <p className="text-[10px] text-muted-foreground">Slugs</p>
        </div>
        {staleDeadCount > 0 ? (
          <div className="rounded-xl border border-orange-500/10 bg-orange-500/5 p-3 text-center">
            <p className="text-lg font-semibold text-orange-400">{staleDeadCount}</p>
            <p className="text-[10px] text-muted-foreground">Stale / Dead</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">0</p>
            <p className="text-[10px] text-muted-foreground">Stale / Dead</p>
          </div>
        )}
      </div>

      {/* Activity Alerts */}
      {(activityAlerts.declining.length > 0 || activityAlerts.surging.length > 0) && (
        <div className="space-y-2">
          {activityAlerts.declining.length > 0 && (
            <div className="rounded-xl border border-red-400/20 bg-red-500/5 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                <span className="text-xs font-medium text-red-400">
                  {activityAlerts.declining.length} group{activityAlerts.declining.length !== 1 ? "s" : ""} declining rapidly
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activityAlerts.declining.map((g) => {
                  const t = groupTrends[g.id];
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroup(g)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-400/10 bg-red-500/5 px-2.5 py-1 text-[10px] text-red-400 hover:bg-red-500/10 transition"
                    >
                      <span className="text-foreground font-medium">{g.group_name}</span>
                      <span>{t?.trend}% this week</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {activityAlerts.surging.length > 0 && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">
                  {activityAlerts.surging.length} group{activityAlerts.surging.length !== 1 ? "s" : ""} surging
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activityAlerts.surging.map((g) => {
                  const t = groupTrends[g.id];
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroup(g)}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-400/10 bg-emerald-500/5 px-2.5 py-1 text-[10px] text-emerald-400 hover:bg-emerald-500/10 transition"
                    >
                      <span className="text-foreground font-medium">{g.group_name}</span>
                      <span>+{t?.trend}% this week</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups..."
          className="max-w-[200px] h-8 text-xs"
        />

        {/* Slug filter pills */}
        <button
          onClick={() => setSlugFilter(null)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            !slugFilter
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:bg-white/5"
          )}
        >
          All ({activeGroups.length})
        </button>
        {allSlugs.map((slug) => (
          <div key={slug} className="flex items-center gap-0.5">
            <button
              onClick={() => setSlugFilter(slugFilter === slug ? null : slug)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
                slugFilter === slug
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-white/5"
              )}
            >
              <Tag className="h-3 w-3" />
              {slug} ({activeGroups.filter((g) => g.slugs.includes(slug)).length})
            </button>
            {tgConnected && (
              <>
                <button
                  title={folderSync.isSynced(slug) ? `Synced to TG folder "CRM: ${slug}"` : "Sync to TG folder"}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      if (folderSync.isSynced(slug)) {
                        await folderSync.disableSync(slug);
                        toast.success(`Folder sync disabled for "${slug}"`);
                      } else {
                        await folderSync.enableSync(slug);
                        toast.success(`TG folder "CRM: ${slug}" created`);
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Folder sync failed");
                    }
                  }}
                  disabled={folderSync.isSlugLoading(slug)}
                  className={cn(
                    "rounded p-1 transition-colors",
                    folderSync.isSynced(slug)
                      ? "text-primary hover:text-primary/80"
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                >
                  {folderSync.isSlugLoading(slug) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : folderSync.isSynced(slug) ? (
                    <FolderSync className="h-3 w-3" />
                  ) : (
                    <FolderX className="h-3 w-3" />
                  )}
                </button>
                {folderSync.isSynced(slug) && (
                  <button
                    title="Re-sync folder peers"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await folderSync.resyncFolder(slug);
                        toast.success(`Folder "CRM: ${slug}" re-synced`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Re-sync failed");
                      }
                    }}
                    disabled={folderSync.isSlugLoading(slug)}
                    className="rounded p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        <div className="h-4 w-px bg-white/10 mx-1" />

        {/* Health filter */}
        <div className="relative">
          <button
            onClick={() =>
              setHealthFilter(healthFilter ? null : "active")
            }
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
              healthFilter
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:bg-white/5"
            )}
          >
            Health
            <ChevronDown className="h-3 w-3" />
          </button>
          {healthFilter && (
            <div className="absolute top-full left-0 mt-1 z-10 rounded-lg border border-white/10 bg-[#1a1a2e] p-1 shadow-xl min-w-[120px]">
              {(["active", "quiet", "stale", "dead", "unknown"] as HealthStatus[]).map(
                (h) => (
                  <button
                    key={h}
                    onClick={() =>
                      setHealthFilter(healthFilter === h ? null : h)
                    }
                    className={cn(
                      "flex items-center gap-2 w-full rounded px-2.5 py-1.5 text-xs transition-colors",
                      healthFilter === h
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-full", HEALTH_CONFIG[h].dot)}
                    />
                    {HEALTH_CONFIG[h].label}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Admin filter */}
        <button
          onClick={() =>
            setAdminFilter(
              adminFilter === null ? true : adminFilter === true ? false : null
            )
          }
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
            adminFilter !== null
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:bg-white/5"
          )}
        >
          {adminFilter === null
            ? "Admin: All"
            : adminFilter
              ? "Admin Only"
              : "Members Only"}
        </button>

        {/* Bot filter */}
        {bots.length > 1 && (
          <select
            value={botFilter ?? ""}
            onChange={(e) => setBotFilter(e.target.value || null)}
            className="rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs text-muted-foreground"
          >
            <option value="">All Bots</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} ({b.groups_count})
              </option>
            ))}
          </select>
        )}

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs text-muted-foreground"
        >
          <option value="name">Sort: Name</option>
          <option value="last_active">Sort: Last Active</option>
          <option value="members">Sort: Members</option>
          <option value="health">Sort: Health</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
          <span className="text-xs font-medium text-primary">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-primary/20" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setBulkAction(bulkAction === "assign_slug" ? null : "assign_slug")}
          >
            <Tag className="mr-1 h-3 w-3" />
            Assign Slug
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setBulkAction(bulkAction === "remove_slug" ? null : "remove_slug")}
          >
            <X className="mr-1 h-3 w-3" />
            Remove Slug
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => handleBulkAction("archive")}
          >
            <Archive className="mr-1 h-3 w-3" />
            Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => handleBulkAction("refresh_status")}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Verify Status
          </Button>
          {bots.length > 1 && (
            <div className="flex items-center gap-1">
              <select
                className="h-7 rounded-lg border border-white/10 bg-transparent px-2 text-xs text-muted-foreground"
                defaultValue=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  const ids = Array.from(selected);
                  await fetch("/api/groups/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "assign_bot", group_ids: ids, bot_id: e.target.value }),
                  });
                  toast.success(`Bot assigned to ${ids.length} groups`);
                  setSelected(new Set());
                  setLoading(true);
                  fetchGroups();
                  e.target.value = "";
                }}
              >
                <option value="">Assign Bot...</option>
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>
          )}
          {selected.size >= 2 && selected.size <= 3 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowComparison(true)}
            >
              <BarChart3 className="mr-1 h-3 w-3" />
              Compare
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              setSelected(new Set());
              setBulkAction(null);
            }}
          >
            Clear
          </Button>

          {(bulkAction === "assign_slug" || bulkAction === "remove_slug") && (
            <div className="flex items-center gap-1 ml-2">
              <Input
                value={bulkSlugInput}
                onChange={(e) => setBulkSlugInput(e.target.value)}
                placeholder="slug-name"
                className="h-7 w-28 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && bulkSlugInput.trim()) {
                    handleBulkAction(bulkAction);
                  }
                  if (e.key === "Escape") setBulkAction(null);
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => handleBulkAction(bulkAction)}
                disabled={!bulkSlugInput.trim()}
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Group list */}
      <div className="space-y-2">
        {/* Select all */}
        {filteredActive.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-1">
            <button
              onClick={toggleSelectAll}
              className={cn(
                "h-4 w-4 rounded border transition-colors flex items-center justify-center",
                selected.size === filteredActive.length
                  ? "bg-primary border-primary"
                  : "border-white/20 hover:border-white/40"
              )}
            >
              {selected.size === filteredActive.length && (
                <Check className="h-3 w-3 text-white" />
              )}
            </button>
            <span className="text-[10px] text-muted-foreground">
              Select all ({filteredActive.length})
            </span>
          </div>
        )}

        {filteredActive.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            bots={bots}
            botMap={botMap}
            isSelected={selected.has(group.id)}
            onToggleSelect={() => toggleSelect(group.id)}
            onOpenDetail={() => setSelectedGroup(group)}
            addingSlug={addingSlug}
            setAddingSlug={setAddingSlug}
            newSlug={newSlug}
            setNewSlug={setNewSlug}
            onAddSlug={handleAddSlug}
            onRemoveSlug={handleRemoveSlug}
            trend={groupTrends[group.id]?.trend ?? null}
            onAssignBot={async (groupId, botId) => {
              await fetch("/api/groups/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "assign_bot", group_ids: [groupId], bot_id: botId }),
              });
              fetchGroups();
            }}
          />
        ))}

        {filteredActive.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              {activeGroups.length === 0
                ? "No groups connected. Add the Telegram bot to your groups as an admin."
                : "No groups match your filter."}
            </p>
          </div>
        )}
      </div>

      {/* Archived groups */}
      {archivedGroups.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Archive className="h-3 w-3" />
            {showArchived ? "Hide" : "Show"} archived ({archivedGroups.length})
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                showArchived && "rotate-180"
              )}
            />
          </button>

          {showArchived && (
            <div className="space-y-2 opacity-60">
              {filteredArchived.map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Archive className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground truncate">
                        {group.group_name}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        Archived {group.archived_at ? timeAgo(group.archived_at as string) : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={async () => {
                        await fetch("/api/groups/bulk", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "unarchive",
                            group_ids: [group.id],
                          }),
                        });
                        setLoading(true);
                        fetchGroups();
                      }}
                    >
                      <ArchiveRestore className="mr-1 h-3 w-3" />
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comparison Modal */}
      {showComparison && selected.size >= 2 && selected.size <= 3 && (
        <ComparisonModal
          groups={groups.filter((g) => selected.has(g.id))}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* Group Detail Panel */}
      <GroupDetailPanel
        group={selectedGroup}
        open={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
      />
    </div>
  );
}

function GroupCard({
  group,
  bots,
  botMap,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  addingSlug,
  setAddingSlug,
  newSlug,
  setNewSlug,
  onAddSlug,
  onRemoveSlug,
  onAssignBot,
  trend = null,
}: {
  group: TgGroup;
  bots: BotInfo[];
  botMap: Record<string, BotInfo>;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  addingSlug: string | null;
  setAddingSlug: (id: string | null) => void;
  newSlug: string;
  setNewSlug: (v: string) => void;
  onAddSlug: (groupId: string) => void;
  onRemoveSlug: (groupId: string, slug: string) => void;
  onAssignBot: (groupId: string, botId: string) => void;
  trend?: number | null;
}) {
  const health = HEALTH_CONFIG[group.health_status];

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 space-y-2 transition-colors",
        isSelected ? "border-primary/30 bg-primary/5" : "border-white/10"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          className={cn(
            "h-4 w-4 rounded border transition-colors flex items-center justify-center shrink-0",
            isSelected
              ? "bg-primary border-primary"
              : "border-white/20 hover:border-white/40"
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-white" />}
        </button>

        {/* Icon */}
        <div className="h-9 w-9 rounded-lg bg-[#229ED9]/20 flex items-center justify-center shrink-0">
          <Users className="h-4 w-4 text-[#229ED9]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button onClick={onOpenDetail} className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors text-left">
              {group.group_name}
            </button>
            {group.group_url && (
              <a
                href={group.group_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline shrink-0"
              >
                Open
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{group.group_type ?? "group"}</span>
            {group.member_count != null && <span>{group.member_count} members</span>}
            <span className="font-mono text-[10px]">
              ID: {group.telegram_group_id}
            </span>
          </div>
        </div>

        {/* Health badge */}
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
            health.bg,
            health.border,
            health.color
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", health.dot)} />
          {health.label}
        </span>

        {/* Bot assignment */}
        {bots.length > 1 ? (
          <select
            value={group.bot_id ?? ""}
            onChange={(e) => {
              if (e.target.value) onAssignBot(group.id, e.target.value);
            }}
            className="h-7 rounded-lg border border-[#2AABEE]/20 bg-[#2AABEE]/5 px-2 text-[10px] text-[#2AABEE] appearance-none cursor-pointer"
            title="Assigned bot"
          >
            <option value="">No bot</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        ) : group.bot_id && botMap[group.bot_id] ? (
          <span className="flex items-center gap-1 rounded-full border border-[#2AABEE]/20 bg-[#2AABEE]/5 px-2 py-0.5 text-[10px] text-[#2AABEE]">
            {botMap[group.bot_id].label}
          </span>
        ) : null}

        {/* Admin badge */}
        {group.bot_is_admin ? (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
            <Shield className="h-3 w-3" /> Admin
            {group.last_bot_check_at && (
              <span className="text-[9px] text-emerald-400/50 ml-0.5">
                {timeAgo(group.last_bot_check_at)}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
            <ShieldOff className="h-3 w-3" /> Member
          </span>
        )}
      </div>

      {/* Activity metrics + sparkline + trend */}
      {(group.last_message_at || group.message_count_7d > 0 || group.message_count_30d > 0 || (group.message_history && group.message_history.length > 0)) && (
        <div className="flex items-center gap-3 pl-[4.5rem] text-[10px] text-muted-foreground">
          {group.message_history && group.message_history.length > 0 && (
            <Sparkline data={group.message_history} healthStatus={group.health_status} />
          )}
          {trend !== null && (
            <span className={cn(
              "flex items-center gap-0.5 font-medium",
              trend >= 10 ? "text-emerald-400" : trend <= -10 ? "text-red-400" : "text-muted-foreground"
            )}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend >= 0 ? "+" : ""}{trend}%
            </span>
          )}
          {group.last_message_at && (
            <span>Last: {timeAgo(group.last_message_at)}</span>
          )}
          {group.message_count_7d > 0 && (
            <span>{group.message_count_7d} msgs/7d</span>
          )}
          {group.message_count_30d > 0 && (
            <span>{group.message_count_30d} msgs/30d</span>
          )}
          {group.member_count && group.message_count_7d > 0 && (
            <span className="text-purple-400">{(group.message_count_7d / group.member_count).toFixed(1)} msgs/member</span>
          )}
        </div>
      )}

      {/* Stale warning */}
      {(group.health_status === "stale" || group.health_status === "dead") && (
        <div className="flex items-center gap-1.5 pl-[4.5rem] text-[10px] text-orange-400">
          <AlertTriangle className="h-3 w-3" />
          {group.health_status === "dead"
            ? "No activity in 30+ days. Consider archiving."
            : "Low activity. Check if bot is still in this group."}
        </div>
      )}

      {/* Slugs */}
      <div className="flex items-center gap-1.5 flex-wrap pl-[4.5rem]">
        {group.slugs.map((slug) => (
          <span
            key={slug}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary"
          >
            <Tag className="h-2.5 w-2.5" />
            {slug}
            <button
              onClick={() => onRemoveSlug(group.id, slug)}
              className="hover:text-red-400 transition ml-0.5"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        {addingSlug === group.id ? (
          <div className="flex items-center gap-1">
            <Input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="slug-name"
              className="h-6 w-24 text-[10px] px-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddSlug(group.id);
                if (e.key === "Escape") {
                  setAddingSlug(null);
                  setNewSlug("");
                }
              }}
            />
            <button
              onClick={() => onAddSlug(group.id)}
              className="text-primary hover:text-primary/80"
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                setAddingSlug(null);
                setNewSlug("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingSlug(group.id)}
            className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-white/20 transition"
          >
            <Plus className="h-2.5 w-2.5" />
            Link Deal
          </button>
        )}
      </div>
    </div>
  );
}
