"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cn, timeAgo } from "@/lib/utils";
import {
  Users,
  MessageCircle,
  ChevronRight,
  RefreshCw,
  Archive,
  ArchiveRestore,
  Sparkles,
  Loader2,
  Tag,
} from "lucide-react";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { hapticImpact, hapticNotification } from "@/components/tma/haptic";

type HealthStatus = "active" | "quiet" | "stale" | "dead" | "unknown";

interface MessageHistoryEntry {
  date: string;
  count: number;
}

interface TgGroup {
  id: string;
  group_name: string;
  member_count: number | null;
  is_archived: boolean;
  message_count_7d: number;
  message_count_30d: number;
  health_status: HealthStatus;
  message_history: MessageHistoryEntry[];
  slugs: string[];
}

interface MemberSummary {
  total: number;
  byTier: Record<string, number>;
}

interface RecentMessage {
  id: string;
  sender_name: string | null;
  message_text: string | null;
  sent_at: string;
  is_from_bot: boolean;
}

interface LinkedDeal {
  id: string;
  deal_name: string;
  stage: { name: string; color: string } | null;
}

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

const SPARKLINE_STROKE: Record<HealthStatus, string> = {
  active: "#34d399",
  quiet: "#facc15",
  stale: "#fb923c",
  dead: "#f87171",
  unknown: "#6b7280",
};

const TIER_COLORS: Record<string, string> = {
  champion: "bg-emerald-400",
  active: "bg-blue-400",
  casual: "bg-yellow-400",
  lurker: "bg-orange-400",
  dormant: "bg-red-400",
  new: "bg-gray-400",
};

function DetailSparkline({
  data,
  healthStatus,
}: {
  data: MessageHistoryEntry[];
  healthStatus: HealthStatus;
}) {
  if (!data || data.length === 0) return null;

  const width = 280;
  const height = 48;
  const padding = 4;
  const counts = data.map((d) => d.count);
  const maxCount = Math.max(...counts, 1);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = counts.map((c, i) => {
    const x = padding + (i / Math.max(counts.length - 1, 1)) * innerW;
    const y = padding + innerH - (c / maxCount) * innerH;
    return `${x},${y}`;
  });

  // Area fill points
  const areaPoints = [
    `${padding},${height - padding}`,
    ...points,
    `${padding + innerW},${height - padding}`,
  ].join(" ");

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
    >
      <polygon
        points={areaPoints}
        fill={SPARKLINE_STROKE[healthStatus]}
        fillOpacity={0.1}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={SPARKLINE_STROKE[healthStatus]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TMAGroupDetailPage() {
  const rawId = useParams().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();

  const [group, setGroup] = React.useState<TgGroup | null>(null);
  const [memberSummary, setMemberSummary] = React.useState<MemberSummary | null>(null);
  const [deals, setDeals] = React.useState<LinkedDeal[]>([]);
  const [recentMessages, setRecentMessages] = React.useState<RecentMessage[]>([]);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [archiving, setArchiving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  const goBack = React.useCallback(() => router.back(), [router]);
  useTelegramWebApp({ onBack: goBack });

  const fetchData = React.useCallback(async () => {
    if (!id) return;

    try {
      const [groupsRes, slugsRes, membersRes, dealsRes] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/groups/slugs"),
        fetch(`/api/groups/members?group_id=${id}`),
        fetch("/api/deals"),
      ]);

      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        const rawGroup = (groupsData.groups ?? []).find(
          (g: TgGroup) => g.id === id
        );
        if (rawGroup) {
          const slugsData = slugsRes.ok ? await slugsRes.json() : { slugs: [] };
          const groupSlugs = (slugsData.slugs ?? [])
            .filter((s: { group_id: string; slug: string }) => s.group_id === id)
            .map((s: { slug: string }) => s.slug);

          setGroup({
            ...rawGroup,
            slugs: groupSlugs,
            message_count_7d: rawGroup.message_count_7d ?? 0,
            message_count_30d: rawGroup.message_count_30d ?? 0,
            health_status: rawGroup.health_status ?? "unknown",
            message_history: rawGroup.message_history ?? [],
            is_archived: rawGroup.is_archived ?? false,
          });
        }
      }

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMemberSummary(membersData.summary ?? null);
      }

      if (dealsRes.ok) {
        const dealsData = await dealsRes.json();
        const linked = (dealsData.deals ?? []).filter(
          (d: LinkedDeal & { tg_group_id?: string }) => d.tg_group_id === id
        );
        setDeals(linked);
      }
    } catch {
      // Silently handle network errors
    }
  }, [id]);

  React.useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  async function handleArchiveToggle() {
    if (!group || !id) return;

    if (!group.is_archived && !confirmArchive) {
      hapticImpact("medium");
      setConfirmArchive(true);
      return;
    }

    setArchiving(true);
    setConfirmArchive(false);
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: !group.is_archived }),
      });
      if (res.ok) {
        hapticNotification("success");
        setGroup({ ...group, is_archived: !group.is_archived });
      } else {
        hapticNotification("error");
      }
    } catch {
      hapticNotification("error");
    } finally {
      setArchiving(false);
    }
  }

  async function handleRefreshStats() {
    setRefreshing(true);
    hapticImpact("light");
    try {
      const res = await fetch("/api/groups/stats");
      if (res.ok) {
        await fetchData();
        hapticNotification("success");
      }
    } catch {
      hapticNotification("error");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleFetchSummary() {
    if (!id) return;
    setSummaryLoading(true);
    setSummaryError(null);
    hapticImpact("light");
    try {
      const res = await fetch(`/api/groups/${id}/summary`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSummary(data.summary);
        // Also populate recent messages from the response timespan if we have them
      } else {
        setSummaryError(data.error ?? "Failed to generate summary");
      }
    } catch {
      setSummaryError("Network error");
    } finally {
      setSummaryLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        <div className="h-48 bg-white/[0.02] rounded-xl animate-pulse" />
        <div className="h-24 bg-white/[0.02] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">Group not found</p>
      </div>
    );
  }

  const health = HEALTH_CONFIG[group.health_status];
  const msgsPerMember =
    group.member_count && group.member_count > 0
      ? (group.message_count_7d / group.member_count).toFixed(1)
      : "--";

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-foreground truncate">
          {group.group_name}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              health.bg,
              health.border,
              health.color
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", health.dot)} />
            {health.label}
          </span>
          {group.is_archived && (
            <span className="text-[10px] rounded-full bg-white/5 border border-white/10 text-muted-foreground px-2 py-0.5">
              Archived
            </span>
          )}
        </div>
      </div>

      {/* Sparkline */}
      <div className="px-4 pb-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] text-muted-foreground mb-1">30-day activity</p>
          <DetailSparkline
            data={group.message_history}
            healthStatus={group.health_status}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Members", value: group.member_count ?? "--" },
            { label: "7d msgs", value: group.message_count_7d },
            { label: "30d msgs", value: group.message_count_30d },
            { label: "Msgs/mbr", value: msgsPerMember },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2 text-center"
            >
              <p className="text-sm font-semibold text-foreground">{stat.value}</p>
              <p className="text-[9px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Engagement tiers */}
      {memberSummary && memberSummary.total > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-medium text-foreground mb-2">Engagement Tiers</p>
            {/* Stacked bar */}
            <div className="h-3 rounded-full overflow-hidden flex bg-white/5">
              {["champion", "active", "casual", "lurker", "dormant", "new"].map(
                (tier) => {
                  const count = memberSummary.byTier[tier] ?? 0;
                  if (count === 0) return null;
                  const pct = (count / memberSummary.total) * 100;
                  return (
                    <div
                      key={tier}
                      className={cn("h-full", TIER_COLORS[tier])}
                      style={{ width: `${pct}%` }}
                      title={`${tier}: ${count}`}
                    />
                  );
                }
              )}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {["champion", "active", "casual", "lurker", "dormant", "new"].map(
                (tier) => {
                  const count = memberSummary.byTier[tier] ?? 0;
                  if (count === 0) return null;
                  return (
                    <span key={tier} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full", TIER_COLORS[tier])} />
                      {tier} ({count})
                    </span>
                  );
                }
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slug tags */}
      {group.slugs.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Slug Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.slugs.map((slug) => (
                <span
                  key={slug}
                  className="text-[10px] rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5"
                >
                  {slug}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Linked deals */}
      {deals.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-medium text-foreground mb-2">Linked Deals</p>
            <div className="space-y-1">
              {deals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/tma/deals/${deal.id}`}
                  className="flex items-center justify-between py-1.5 transition active:bg-white/[0.04] rounded-lg px-1"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {deal.stage && (
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: deal.stage.color }}
                      />
                    )}
                    <span className="text-xs text-foreground truncate">
                      {deal.deal_name}
                    </span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Summary */}
      <div className="px-4 pb-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-purple-400" /> AI Summary
            </p>
            {!summary && !summaryLoading && (
              <button
                onClick={handleFetchSummary}
                className="text-[10px] text-primary font-medium"
              >
                Generate
              </button>
            )}
          </div>
          {summaryLoading && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
              <span className="text-xs text-muted-foreground">Analyzing conversation...</span>
            </div>
          )}
          {summaryError && (
            <p className="text-xs text-red-400">{summaryError}</p>
          )}
          {summary && (
            <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {summary}
            </div>
          )}
          {!summary && !summaryLoading && !summaryError && (
            <p className="text-[10px] text-muted-foreground/50">
              Tap Generate to get an AI summary of recent conversation.
            </p>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={handleArchiveToggle}
          disabled={archiving}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition active:scale-[0.98]",
            group.is_archived
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
              : "border-red-500/20 bg-red-500/5 text-red-400"
          )}
        >
          {archiving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : group.is_archived ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          {confirmArchive
            ? "Tap again to confirm"
            : group.is_archived
              ? "Unarchive"
              : "Archive"}
        </button>

        <button
          onClick={handleRefreshStats}
          disabled={refreshing}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-xs font-medium text-foreground transition active:scale-[0.98]"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh Stats
        </button>
      </div>
    </div>
  );
}
