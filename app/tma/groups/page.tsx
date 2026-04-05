"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, Users, Zap, TrendingUp } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { GroupHealthCard } from "@/components/tma/group-health-card";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { useOfflineCache } from "@/lib/client/tma-offline";

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

type FilterTab = "all" | "active" | "needs_attention" | "dead";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "needs_attention", label: "Needs Attention" },
  { key: "dead", label: "Dead" },
];

export default function TMAGroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterTab>("all");
  const [engagementScores, setEngagementScores] = React.useState<Map<string, number>>(new Map());

  useTelegramWebApp();

  // Offline cache for groups
  const groupsCache = useOfflineCache<{ groups: TgGroup[] }>("/api/groups?per_page=200", { maxAgeMs: 10 * 60_000 });

  const fetchData = React.useCallback(async () => {
    try {
      const [groupsRes, slugsRes, engagementRes] = await Promise.all([
        fetch("/api/groups?per_page=200"),
        fetch("/api/groups/slugs"),
        fetch("/api/groups/engagement?days=30&limit=100"),
      ]);

      if (!groupsRes.ok) return;

      const groupsData = await groupsRes.json();
      const rawGroups = groupsData.groups ?? [];

      const slugsData = slugsRes.ok ? await slugsRes.json() : { slugs: [] };
      const slugMap: Record<string, string[]> = {};
      for (const s of slugsData.slugs ?? []) {
        if (!slugMap[s.group_id]) slugMap[s.group_id] = [];
        slugMap[s.group_id].push(s.slug);
      }

      // Parse engagement scores
      if (engagementRes.ok) {
        const engData = await engagementRes.json();
        const scoreMap = new Map<string, number>();
        for (const s of engData.scores ?? []) {
          scoreMap.set(String(s.chat_id), Math.round(s.engagement_score));
        }
        setEngagementScores(scoreMap);
      }

      setGroups(
        rawGroups.map((g: TgGroup) => ({
          ...g,
          slugs: slugMap[g.id] ?? [],
          message_count_7d: g.message_count_7d ?? 0,
          message_count_30d: g.message_count_30d ?? 0,
          health_status: g.health_status ?? "unknown",
          message_history: g.message_history ?? [],
          is_archived: g.is_archived ?? false,
        }))
      );
    } catch {
      // Network failed — fall back to offline cache
      if (groupsCache.data) {
        setGroups(
          (groupsCache.data.groups ?? []).map((g) => ({
            ...g,
            slugs: g.slugs ?? [],
            message_count_7d: g.message_count_7d ?? 0,
            message_count_30d: g.message_count_30d ?? 0,
            health_status: g.health_status ?? "unknown",
            message_history: g.message_history ?? [],
            is_archived: g.is_archived ?? false,
          }))
        );
      }
    }
  }, [groupsCache.data]);

  React.useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const filteredGroups = React.useMemo(() => {
    let result = groups.filter((g) => !g.is_archived);

    if (filter === "active") {
      result = result.filter((g) => g.health_status === "active");
    } else if (filter === "needs_attention") {
      result = result.filter(
        (g) => g.health_status === "quiet" || g.health_status === "stale"
      );
    } else if (filter === "dead") {
      result = result.filter((g) => g.health_status === "dead");
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((g) => g.group_name.toLowerCase().includes(q));
    }

    return result;
  }, [groups, filter, search]);

  function handleGroupTap(id: string) {
    router.push(`/tma/groups/${id}`);
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-32 bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PullToRefresh onRefresh={fetchData}>
        {/* Header */}
        <div className="px-4 pt-4 pb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Groups</h1>
          <span className="text-xs text-muted-foreground">
            {groups.filter((g) => !g.is_archived).length} groups
          </span>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups..."
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-8 pr-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition",
                filter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Group list — windowed rendering for large lists */}
        <GroupList
          groups={filteredGroups}
          engagementScores={engagementScores}
          onTap={handleGroupTap}
          search={search}
        />
      </PullToRefresh>

      <BottomTabBar active="groups" />
    </div>
  );
}

/**
 * Windowed group list — renders only visible items + buffer for lists >50.
 * Uses IntersectionObserver to progressively reveal items as the user scrolls.
 */
function GroupList({
  groups,
  engagementScores,
  onTap,
  search,
}: {
  groups: TgGroup[];
  engagementScores: Map<string, number>;
  onTap: (id: string) => void;
  search: string;
}) {
  const WINDOW_SIZE = 50;
  const [visibleCount, setVisibleCount] = React.useState(WINDOW_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  // Reset visible count when groups change (filter/search)
  React.useEffect(() => {
    setVisibleCount(WINDOW_SIZE);
  }, [groups.length, search]);

  // IntersectionObserver to load more when sentinel is visible
  React.useEffect(() => {
    if (groups.length <= WINDOW_SIZE) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + WINDOW_SIZE, groups.length));
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [groups.length]);

  if (groups.length === 0) {
    return (
      <div className="px-4">
        <div className="text-center py-8">
          <Users className="mx-auto h-6 w-6 text-muted-foreground/20" />
          <p className="mt-2 text-xs text-muted-foreground">
            {search ? "No groups match your search" : "No groups found"}
          </p>
        </div>
      </div>
    );
  }

  const visible = groups.slice(0, visibleCount);

  return (
    <div className="px-4 space-y-1.5">
      {visible.map((group) => (
        <GroupHealthCard
          key={group.id}
          id={group.id}
          name={group.group_name}
          healthStatus={group.health_status}
          memberCount={group.member_count}
          messageCount7d={group.message_count_7d}
          messageHistory={group.message_history}
          slugs={group.slugs}
          engagementScore={engagementScores.get(group.id) ?? null}
          onTap={onTap}
        />
      ))}
      {visibleCount < groups.length && (
        <div ref={sentinelRef} className="h-8 flex items-center justify-center">
          <span className="text-[10px] text-muted-foreground/40">Loading more...</span>
        </div>
      )}
    </div>
  );
}
