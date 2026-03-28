"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { SwipeableDealCard } from "@/components/tma/swipeable-deal-card";
import { QuickActionMenu } from "@/components/tma/quick-action-menu";
import { hapticImpact } from "@/components/tma/haptic";

type Deal = {
  id: string;
  deal_name: string;
  board_type: string;
  stage_id: string | null;
  value: number | null;
  contact: { name: string } | null;
  stage: { id: string; name: string; color: string; position: number } | null;
};

type Stage = { id: string; name: string; position: number; color: string };

export default function TMADealsPage() {
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedStages, setExpandedStages] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [quickAction, setQuickAction] = React.useState<{
    deal: Deal;
    position: { top: number; left: number };
  } | null>(null);

  // Telegram WebApp init
  React.useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Telegram) {
      const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void } } }).Telegram.WebApp;
      tg.ready();
      tg.expand();
    }
  }, []);

  // Data fetching
  const fetchData = React.useCallback(async () => {
    const [dealsData, stagesData] = await Promise.all([
      fetch("/api/deals").then((r) => r.json()),
      fetch("/api/pipeline").then((r) => r.json()),
    ]);
    const newDeals = dealsData.deals ?? [];
    const newStages = stagesData.stages ?? [];
    setDeals(newDeals);
    setStages(newStages);
    // Expand all stages on first load
    setExpandedStages((prev) => prev.size === 0 ? new Set(newStages.map((s: Stage) => s.id)) : prev);
  }, []);

  React.useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Pull to refresh handler
  const handleRefresh = React.useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Swipe to change stage
  async function handleStageChange(dealId: string, newStageId: string) {
    // Optimistic update
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== dealId) return d;
        const newStage = stages.find((s) => s.id === newStageId);
        return {
          ...d,
          stage_id: newStageId,
          stage: newStage ? { id: newStage.id, name: newStage.name, color: newStage.color, position: newStage.position } : d.stage,
        };
      })
    );

    const res = await fetch(`/api/deals/${dealId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: newStageId }),
    });

    if (!res.ok) {
      // Revert on failure
      await fetchData();
    }
  }

  // Long press quick actions
  function handleLongPress(deal: Deal, rect: DOMRect) {
    setQuickAction({ deal, position: { top: rect.top, left: rect.left + rect.width / 2 } });
  }

  async function handleMarkOutcome(dealId: string, outcome: "won" | "lost") {
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    hapticImpact("medium");
    await fetchData();
  }

  function handleAddNote(dealId: string) {
    // Navigate to deal detail with notes tab
    window.location.href = `/tma/deals/${dealId}?tab=notes`;
  }

  function toggleStage(stageId: string) {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  const filteredDeals = search
    ? deals.filter((d) => d.deal_name.toLowerCase().includes(search.toLowerCase()))
    : deals;

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/[0.02] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="px-4 pt-4 pb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Pipeline</h1>
          <span className="text-xs text-muted-foreground">{deals.length} deals</span>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals..."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="px-4 space-y-2">
          {stages.map((stage) => {
            const stageDeals = filteredDeals.filter((d) => d.stage_id === stage.id);
            const expanded = expandedStages.has(stage.id);

            return (
              <div key={stage.id} className="rounded-xl border border-white/10 overflow-hidden">
                <button
                  onClick={() => toggleStage(stage.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-white/[0.03] transition active:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-xs font-medium text-foreground">{stage.name}</span>
                    <span className="text-[10px] text-muted-foreground/60">({stageDeals.length})</span>
                  </div>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
                </button>

                {expanded && stageDeals.length > 0 && (
                  <div className="divide-y divide-white/5">
                    {stageDeals.map((deal) => (
                      <SwipeableDealCard
                        key={deal.id}
                        deal={deal}
                        stages={stages}
                        onStageChange={handleStageChange}
                        onLongPress={handleLongPress}
                      />
                    ))}
                  </div>
                )}

                {expanded && stageDeals.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[10px] text-muted-foreground/40">No deals</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PullToRefresh>

      {/* Quick action menu (from long press) */}
      {quickAction && (
        <QuickActionMenu
          dealId={quickAction.deal.id}
          dealName={quickAction.deal.deal_name}
          position={quickAction.position}
          onClose={() => setQuickAction(null)}
          onAddNote={handleAddNote}
          onMarkWon={(id) => handleMarkOutcome(id, "won")}
          onMarkLost={(id) => handleMarkOutcome(id, "lost")}
        />
      )}

      <BottomTabBar active="pipeline" />
    </div>
  );
}
