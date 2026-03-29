"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { BarChart3, History } from "lucide-react";
import { toast } from "sonner";
import type { TgGroup, Broadcast, AnalyticsData, BotTemplate } from "@/components/broadcasts/types";
import { BroadcastAnalytics } from "@/components/broadcasts/BroadcastAnalytics";
import { BroadcastHistory } from "@/components/broadcasts/BroadcastHistory";
import { BroadcastCompose } from "@/components/broadcasts/BroadcastCompose";
import { RecipientSelector } from "@/components/broadcasts/RecipientSelector";

export default function BroadcastsPage() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = React.useState(false);
  const [showAnalytics, setShowAnalytics] = React.useState(false);

  // Multi-slug targeting
  const [selectedSlugs, setSelectedSlugs] = React.useState<Set<string>>(new Set());
  const [slugMode, setSlugMode] = React.useState<"any" | "all">("any");

  // History
  const [broadcasts, setBroadcasts] = React.useState<Broadcast[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // Analytics
  const [analytics, setAnalytics] = React.useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);

  // Templates
  const [templates, setTemplates] = React.useState<BotTemplate[]>([]);

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

  const totalRecipients = React.useMemo(() => {
    return groups
      .filter((g) => selectedGroupIds.has(g.id))
      .reduce((sum, g) => sum + (g.member_count ?? 0), 0);
  }, [groups, selectedGroupIds]);

  React.useEffect(() => {
    if (selectedSlug) {
      const matching = groups.filter((g) => g.slugs.includes(selectedSlug));
      setSelectedGroupIds(new Set(matching.map((g) => g.id)));
    } else if (selectedSlugs.size > 0) {
      setSelectedGroupIds(new Set(filteredGroups.map((g) => g.id)));
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__broadcastComposeLoadMessage?.(text);
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

      {showAnalytics ? (
        <BroadcastAnalytics analytics={analytics} loading={analyticsLoading} />
      ) : showHistory ? (
        <BroadcastHistory
          broadcasts={broadcasts}
          loading={historyLoading}
          onRefresh={fetchHistory}
          onCancel={cancelBroadcast}
          onReuse={reuseMessage}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BroadcastCompose
            groups={groups}
            selectedGroupIds={selectedGroupIds}
            totalRecipients={totalRecipients}
            selectedSlug={selectedSlug}
            templates={templates}
            showHistory={showHistory}
            onSendComplete={fetchHistory}
          />
          <RecipientSelector
            groups={groups}
            filteredGroups={filteredGroups}
            allSlugs={allSlugs}
            selectedSlug={selectedSlug}
            selectedSlugs={selectedSlugs}
            slugMode={slugMode}
            selectedGroupIds={selectedGroupIds}
            onSlugChange={setSelectedSlug}
            onSlugsChange={setSelectedSlugs}
            onSlugModeChange={setSlugMode}
            onToggleGroup={toggleGroup}
            onSelectAll={() => setSelectedGroupIds(new Set(filteredGroups.map((g) => g.id)))}
            onSelectNone={() => setSelectedGroupIds(new Set())}
          />
        </div>
      )}
    </div>
  );
}
