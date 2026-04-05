"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AlertTriangle, Flame, ChevronRight, Zap, WifiOff, Plus, Users, MessageSquare, Calendar, Video } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { cacheGet, cacheGetWithTimestamp, cacheSet } from "@/components/tma/offline-cache";

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

type Group = {
  id: string;
  group_name: string;
  member_count: number | null;
  health_status: "active" | "quiet" | "stale" | "dead" | "unknown";
  is_archived: boolean;
  message_count_7d: number | null;
  last_message_at: string | null;
};

type Meeting = {
  id: string;
  summary: string;
  start_at: string | null;
  start_date: string | null;
  hangout_link: string | null;
  html_link: string | null;
};

export default function TMAHomePage() {
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [meetings, setMeetings] = React.useState<Meeting[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fromCache, setFromCache] = React.useState(false);
  const [cacheAge, setCacheAge] = React.useState<number | null>(null);

  const { tgUser } = useTelegramWebApp();

  const fetchData = React.useCallback(async () => {
    // Try loading from cache first (with timestamp for stale indicator)
    const [cachedDeals, cachedStats, cachedGroups] = await Promise.all([
      cacheGetWithTimestamp<Deal[]>("deals", "tma-home"),
      cacheGet<Stats>("stats", "tma-home"),
      cacheGet<Group[]>("groups", "tma-home"),
    ]);

    if (cachedDeals?.data || cachedStats || cachedGroups) {
      if (cachedDeals?.data) setDeals(cachedDeals.data);
      if (cachedStats) setStats(cachedStats);
      if (cachedGroups) setGroups(cachedGroups);
      setFromCache(true);
      if (cachedDeals?.cachedAt) setCacheAge(cachedDeals.cachedAt);
      setLoading(false);
    }

    // Fetch fresh data from network
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const [dealsData, statsData, groupsData, calData] = await Promise.all([
        fetch("/api/deals").then((r) => r.ok ? r.json() : { deals: [] }).catch(() => ({ deals: [] })),
        fetch("/api/stats").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/groups").then((r) => r.ok ? r.json() : { groups: [] }).catch(() => ({ groups: [] })),
        fetch(`/api/calendar/google/events?from=${todayStart.toISOString()}&to=${todayEnd.toISOString()}`).then((r) => r.ok ? r.json() : { events: [] }).catch(() => ({ events: [] })),
      ]);
      setMeetings((calData.events ?? []).sort((a: Meeting, b: Meeting) => (a.start_at ?? "").localeCompare(b.start_at ?? "")));

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

      setDeals(parsedDeals);
      setStats(parsedStats);
      setGroups(parsedGroups);
      setFromCache(false);
      setCacheAge(null);

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
        if (staleDeals || staleStats || staleGroups) setFromCache(true);
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
            <span className="inline-flex items-center gap-1 ml-2 text-[10px] text-amber-400">
              <WifiOff className="h-2.5 w-2.5" />
              {cacheAge ? `Updated ${Math.round((Date.now() - cacheAge) / 60000)}m ago` : "Offline"}
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

      {/* Cross-Signal Alerts: stale/dead groups with active deals */}
      {(() => {
        const staleGroups = groups.filter((g) => g.health_status === "stale" || g.health_status === "dead");
        if (staleGroups.length === 0) return null;
        // Simple name-based cross-reference: check if any deal name partially matches group name
        const alerts = staleGroups
          .map((g) => {
            const matchingDeal = deals.find((d) =>
              g.group_name.toLowerCase().includes(d.deal_name.toLowerCase().split(" ")[0]) ||
              d.deal_name.toLowerCase().includes(g.group_name.toLowerCase().split(" ")[0])
            );
            return matchingDeal ? { group: g, deal: matchingDeal } : null;
          })
          .filter(Boolean) as { group: Group; deal: Deal }[];
        if (alerts.length === 0) return null;
        return (
          <div className="px-4 mb-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <p className="text-xs font-medium text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Deal + Group Alerts
              </p>
              {alerts.slice(0, 3).map((a, i) => (
                <Link key={i} href={`/tma/deals/${a.deal.id}`} className="flex items-center justify-between py-1">
                  <span className="text-xs text-foreground truncate">{a.deal.deal_name}</span>
                  <span className="text-[10px] text-red-400">{a.group.group_name} is {a.group.health_status}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Today's Meetings */}
      {meetings.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Today&apos;s Calls
            </p>
            <span className="text-[10px] text-muted-foreground">{meetings.length} meetings</span>
          </div>
          <div className="space-y-1.5">
            {meetings.slice(0, 5).map((m) => {
              const time = m.start_at ? new Date(m.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "All day";
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-primary font-medium shrink-0 w-12">{time}</span>
                    <span className="text-xs text-foreground truncate">{m.summary || "No title"}</span>
                  </div>
                  {m.hangout_link && (
                    <a
                      href={m.hangout_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 rounded-lg bg-green-500/15 px-2 py-1 text-[10px] text-green-400 font-medium"
                    >
                      <Video className="h-3 w-3" /> Join
                    </a>
                  )}
                </div>
              );
            })}
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

      <BottomTabBar active="home" />
    </div>
  );
}
