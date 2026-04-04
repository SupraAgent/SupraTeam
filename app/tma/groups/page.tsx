"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, Users, Zap } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { GroupHealthCard } from "@/components/tma/group-health-card";
import { useTelegramWebApp } from "@/components/tma/use-telegram";

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

  useTelegramWebApp();

  const fetchData = React.useCallback(async () => {
    try {
      const [groupsRes, slugsRes] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/groups/slugs"),
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
      // Silently handle network errors
    }
  }, []);

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

        {/* Group list */}
        <div className="px-4 space-y-1.5">
          {filteredGroups.map((group) => (
            <GroupHealthCard
              key={group.id}
              id={group.id}
              name={group.group_name}
              healthStatus={group.health_status}
              memberCount={group.member_count}
              messageCount7d={group.message_count_7d}
              messageHistory={group.message_history}
              slugs={group.slugs}
              onTap={handleGroupTap}
            />
          ))}
          {filteredGroups.length === 0 && (
            <div className="text-center py-8">
              <Users className="mx-auto h-6 w-6 text-muted-foreground/20" />
              <p className="mt-2 text-xs text-muted-foreground">
                {search ? "No groups match your search" : "No groups found"}
              </p>
            </div>
          )}
        </div>
      </PullToRefresh>

      <BottomTabBar active="groups" />
    </div>
  );
}
