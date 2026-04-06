"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AlertTriangle, Flame, ChevronRight, Zap, WifiOff, Plus, Users, MessageSquare } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { cacheGet, cacheSet } from "@/components/tma/offline-cache";
import { useFocusRefresh } from "@/components/tma/use-focus-refresh";

type Deal = {
  id: string;
  deal_name: string;
  board_type: string;
  value: number | null;
  stage: { name: string; color: string } | null;
};

type Stats = {
  totalDeals: number;
  staleDeals: { id: string; deal_name: string; days_stale: number }[];
  followUps: { id: string; deal_name: string; hours_since: number }[];
  hotConversations: { name: string; count: number; deal_id: string }[];
};

type Highlight = {
  id: string;
  deal_id: string | null;
  sender_name: string | null;
  message_preview: string | null;
  tg_deep_link: string | null;
  triage_urgency: string | null;
  triage_category: string | null;
  triage_summary: string | null;
  created_at: string;
};

type Group = {
  id: string;
  group_name: string;
  member_count: number | null;
  health_status: "active" | "quiet" | "stale" | "dead" | "unknown";
  is_archived: boolean;
  message_count_7d: number | null;
  last_message_at: string | null;
};

export default function TMAHomePage() {
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [urgentHighlights, setUrgentHighlights] = React.useState<Highlight[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fromCache, setFromCache] = React.useState<false | "cache" | "stale">(false);

  const { tgUser } = useTelegramWebApp();
  useFocusRefresh(() => fetchData());

  const fetchData = React.useCallback(async () => {
    // Try loading from cache first
    const [cachedDeals, cachedStats, cachedGroups] = await Promise.all([
      cacheGet<Deal[]>("deals", "tma-home"),
      cacheGet<Stats>("stats", "tma-home"),
      cacheGet<Group[]>("groups", "tma-home"),
    ]);

    if (cachedDeals || cachedStats || cachedGroups) {
      if (cachedDeals) setDeals(cachedDeals);
      if (cachedStats) setStats(cachedStats);
      if (cachedGroups) setGroups(cachedGroups);
      setFromCache("cache");
      setLoading(false);
    }

    // Fetch fresh data from network
    try {
      const [dealsData, statsData, groupsData, highlightsData] = await Promise.all([
        fetch("/api/deals").then((r) => r.ok ? r.json() : { deals: [] }).catch(() => ({ deals: [] })),
        fetch("/api/stats").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/groups").then((r) => r.ok ? r.json() : { groups: [] }).catch(() => ({ groups: [] })),
        fetch("/api/highlights").then((r) => r.ok ? r.json() : { highlights: [] }).catch(() => ({ highlights: [] })),
      ]);

      const parsedDeals: Deal[] = dealsData.deals ?? [];
      const parsedStats: Stats = statsData ? {
        totalDeals: statsData.totalDeals ?? 0,
        staleDeals: statsData.staleDeals ?? [],
        followUps: statsData.followUps ?? [],
        hotConversations: statsData.hotConversations ?? [],
      } : { totalDeals: 0, staleDeals: [], followUps: [], hotConversations: [] };
      const parsedGroups: Group[] = (groupsData.groups ?? [])
        .filter((g: Group) => !g.is_archived)
        .sort((a: Group, b: Group) => {
          const order = { active: 0, quiet: 1, stale: 2, dead: 3, unknown: 4 };
          return (order[a.health_status] ?? 4) - (order[b.health_status] ?? 4);
        });

      // Extract critical + high urgency highlights
      const allHighlights: Highlight[] = highlightsData.highlights ?? [];
      const urgent = allHighlights
        .filter((h: Highlight) => h.triage_urgency === "critical" || h.triage_urgency === "high")
        .sort((a: Highlight, b: Highlight) => {
          const rank: Record<string, number> = { critical: 2, high: 1 };
          return (rank[b.triage_urgency ?? ""] ?? 0) - (rank[a.triage_urgency ?? ""] ?? 0);
        })
        .slice(0, 5);
      setUrgentHighlights(urgent);

      setDeals(parsedDeals);
      setStats(parsedStats);
      setGroups(parsedGroups);
      setFromCache(false);

      // Cache the fresh data
      await Promise.all([
        cacheSet("deals", "tma-home", parsedDeals),
        cacheSet("stats", "tma-home", parsedStats),
        cacheSet("groups", "tma-home", parsedGroups),
      ]);
    } catch {
      // Network error — fall back to stale cache if nothing was loaded yet
      if (!cachedDeals && !cachedStats && !cachedGroups) {
        const [staleDeals, staleStats, staleGroups] = await Promise.all([
          cacheGet<Deal[]>("deals", "tma-home", Infinity),
          cacheGet<Stats>("stats", "tma-home", Infinity),
          cacheGet<Group[]>("groups", "tma-home", Infinity),
        ]);
        if (staleDeals) setDeals(staleDeals);
        if (staleStats) setStats(staleStats);
        if (staleGroups) setGroups(staleGroups);
        if (staleDeals || staleStats || staleGroups) setFromCache("stale");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-32 bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PullToRefresh onRefresh={fetchData}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-semibold text-foreground">
          {tgUser ? `Hi ${tgUser.first_name}` : "SupraTeam"}
        </h1>
        <p className="text-xs text-muted-foreground">
          {deals.length} active deals
          {fromCache && (
            <span className={cn(
              "inline-flex items-center gap-1 ml-2 text-[10px]",
              fromCache === "stale" ? "text-red-400" : "text-amber-400"
            )}>
              <WifiOff className="h-2.5 w-2.5" /> {fromCache === "stale" ? "Stale data" : "Offline"}
            </span>
          )}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/tma/deals?create=1"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] py-3 transition active:bg-white/[0.06]"
          >
            <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">New Deal</span>
          </Link>
          <Link
            href="/tma/contacts?create=1"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] py-3 transition active:bg-white/[0.06]"
          >
            <div className="h-9 w-9 rounded-full bg-blue-500/15 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">New Contact</span>
          </Link>
          <Link
            href="/tma/inbox"
            className="relative flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] py-3 transition active:bg-white/[0.06]"
          >
            <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-amber-400" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">Inbox</span>
            {stats && stats.hotConversations.length > 0 && (
              <span className="absolute top-1.5 right-3 h-4 min-w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center px-1">
                {stats.hotConversations.length}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* AI Urgency — Needs Attention Now */}
      {urgentHighlights.length > 0 && (
        <div className="px-4 mb-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
            <p className="text-xs font-medium text-red-400 flex items-center gap-1">
              <Zap className="h-3 w-3" /> Needs Attention Now
              <span className="ml-auto rounded-full bg-red-500/20 px-1.5 py-0 text-[10px] font-bold">{urgentHighlights.length}</span>
            </p>
            {urgentHighlights.map((h) => {
              const isCritical = h.triage_urgency === "critical";
              const href = h.tg_deep_link ?? (h.deal_id ? `/tma/deals/${h.deal_id}` : "/tma/inbox");
              const summary = h.triage_summary ? h.triage_summary.split(" | ")[0] : h.message_preview;
              return (
                <Link
                  key={h.id}
                  href={href}
                  className={cn(
                    "flex items-start gap-2 py-1.5 rounded-lg px-1 -mx-1 transition active:bg-white/[0.04]",
                    isCritical && "border-l-2 border-l-red-500 pl-2"
                  )}
                >
                  <span className={cn(
                    "h-2 w-2 rounded-full shrink-0 mt-1",
                    isCritical ? "bg-red-500 animate-pulse" : "bg-orange-500"
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground truncate">{h.sender_name ?? "Unknown"}</span>
                      {h.triage_category && (
                        <span className={cn(
                          "rounded px-1 py-0 text-[8px] font-medium",
                          isCritical ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"
                        )}>
                          {h.triage_category.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{summary?.slice(0, 80) ?? "New message"}</p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Urgent section */}
      {stats && (stats.staleDeals.length > 0 || stats.followUps.length > 0 || stats.hotConversations.length > 0) && (
        <div className="px-4 mb-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Needs Attention
            </p>
            {stats.staleDeals.slice(0, 2).map((d) => (
              <Link key={d.id} href={`/tma/deals/${d.id}`} className="flex items-center justify-between py-1">
                <span className="text-xs text-foreground">{d.deal_name}</span>
                <span className="text-[10px] text-red-400">{d.days_stale}d stale</span>
              </Link>
            ))}
            {stats.followUps.slice(0, 2).map((d) => (
              <Link key={d.id} href={`/tma/deals/${d.id}`} className="flex items-center justify-between py-1">
                <span className="text-xs text-foreground">{d.deal_name}</span>
                <span className="text-[10px] text-yellow-400">{d.hours_since}h follow-up</span>
              </Link>
            ))}
            {stats.hotConversations.slice(0, 2).map((c, i) => (
              <Link key={i} href={c.deal_id ? `/tma/deals/${c.deal_id}` : "#"} className="flex items-center justify-between py-1">
                <span className="text-xs text-foreground flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-400" /> {c.name}
                </span>
                <span className="text-[10px] text-blue-400">{c.count} msgs</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Group Health */}
      {groups.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Group Health</p>
            <span className="text-[10px] text-muted-foreground">{groups.length} groups</span>
          </div>
          <div className="space-y-1.5">
            {groups.slice(0, 5).map((group) => {
              const statusColor =
                group.health_status === "active" ? "bg-green-400" :
                group.health_status === "quiet" ? "bg-amber-400" :
                group.health_status === "stale" ? "bg-orange-400" :
                group.health_status === "dead" ? "bg-red-400" :
                "bg-zinc-400";
              return (
                <div
                  key={group.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", statusColor)} />
                    <span className="text-xs text-foreground truncate">{group.group_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {group.message_count_7d != null && group.message_count_7d > 0 && (
                      <span className="text-[10px] text-muted-foreground">{group.message_count_7d} msgs/wk</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {group.member_count ?? 0} members
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deals list */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">My Deals</p>
          <Link href="/tma/deals" className="text-[10px] text-primary">View all</Link>
        </div>
        <div className="space-y-1.5">
          {deals.slice(0, 10).map((deal) => (
            <Link
              key={deal.id}
              href={`/tma/deals/${deal.id}`}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 transition active:bg-white/[0.06]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{deal.deal_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {deal.stage && (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: deal.stage.color }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                      {deal.stage.name}
                    </span>
                  )}
                  <span className={cn(
                    "text-[10px]",
                    deal.board_type === "BD" ? "text-blue-400" : deal.board_type === "Marketing" ? "text-purple-400" : "text-orange-400"
                  )}>
                    {deal.board_type}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {deal.value != null && deal.value > 0 && (
                  <span className="text-xs text-muted-foreground">${Number(deal.value).toLocaleString()}</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />
              </div>
            </Link>
          ))}
          {deals.length === 0 && (
            <div className="text-center py-8">
              <Zap className="mx-auto h-6 w-6 text-muted-foreground/20" />
              <p className="mt-2 text-xs text-muted-foreground">No deals yet</p>
            </div>
          )}
        </div>
      </div>
      </PullToRefresh>

      {/* Floating Action Button — create deal */}
      <Link
        href="/tma/deals?create=1"
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 text-primary-foreground transition active:scale-95"
      >
        <Plus className="h-5 w-5" />
      </Link>

      <BottomTabBar active="home" />
    </div>
  );
}
