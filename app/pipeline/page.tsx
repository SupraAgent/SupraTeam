"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { DealListView } from "@/components/pipeline/deal-list-view";
import { CreateDealModal } from "@/components/pipeline/create-deal-modal";
import { DealDetailPanel } from "@/components/pipeline/deal-detail-panel";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import type { Deal, PipelineStage, Contact, BoardType } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOARDS: BoardType[] = ["All", "BD", "Marketing", "Admin"];

function makeSampleDeals(stages: PipelineStage[]): Deal[] {
  if (stages.length < 3) return [];
  return [
    {
      id: "sample-1", deal_name: "Acme Corp Partnership", contact_id: null, assigned_to: null,
      board_type: "BD", stage_id: stages[0].id, value: 50000, probability: 30,
      telegram_chat_id: null, telegram_chat_name: null, telegram_chat_link: null,
      stage_changed_at: new Date().toISOString(), created_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      contact: null, stage: stages[0], assigned_profile: null,
    },
    {
      id: "sample-2", deal_name: "DeFi Protocol Integration", contact_id: null, assigned_to: null,
      board_type: "BD", stage_id: stages[1].id, value: 120000, probability: 50,
      telegram_chat_id: null, telegram_chat_name: null, telegram_chat_link: null,
      stage_changed_at: new Date().toISOString(), created_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      contact: null, stage: stages[1], assigned_profile: null,
    },
    {
      id: "sample-3", deal_name: "Exchange Listing Sponsorship", contact_id: null, assigned_to: null,
      board_type: "Marketing", stage_id: stages[2].id, value: 25000, probability: 60,
      telegram_chat_id: null, telegram_chat_name: null, telegram_chat_link: null,
      stage_changed_at: new Date().toISOString(), created_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      contact: null, stage: stages[2], assigned_profile: null,
    },
    {
      id: "sample-4", deal_name: "Node Operator MOU", contact_id: null, assigned_to: null,
      board_type: "Admin", stage_id: stages[4]?.id ?? stages[2].id, value: 75000, probability: 80,
      telegram_chat_id: null, telegram_chat_name: null, telegram_chat_link: null,
      stage_changed_at: new Date().toISOString(), created_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      contact: null, stage: stages[4] ?? stages[2], assigned_profile: null,
    },
  ];
}

export default function PipelinePage() {
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [board, setBoard] = React.useState<BoardType>("All");
  const [viewMode, setViewMode] = React.useState<"kanban" | "list">(
    typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "kanban"
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [usingSamples, setUsingSamples] = React.useState(false);
  const [highlightDealId, setHighlightDealId] = React.useState<string | null>(null);
  const [highlightedDealIds, setHighlightedDealIds] = React.useState<Set<string>>(new Set());
  const searchParams = useSearchParams();
  const router = useRouter();

  // Handle ?highlight=deal-id
  React.useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight) {
      setHighlightDealId(highlight);
      // Scroll to the deal card after a short delay
      setTimeout(() => {
        const el = document.querySelector(`[data-deal-id="${highlight}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      }, 500);
      // Clear highlight after 4 seconds
      setTimeout(() => {
        setHighlightDealId(null);
        router.replace("/pipeline", { scroll: false });
      }, 4000);
    }
  }, [searchParams, router]);

  const fetchData = React.useCallback(async () => {
    try {
      const [stagesRes, dealsRes, contactsRes, highlightsRes] = await Promise.all([
        fetch("/api/pipeline"),
        fetch("/api/deals"),
        fetch("/api/contacts"),
        fetch("/api/highlights"),
      ]);

      let fetchedStages: PipelineStage[] = [];
      let fetchedDeals: Deal[] = [];

      if (stagesRes.ok) {
        const data = await stagesRes.json();
        fetchedStages = data.stages ?? [];
        setStages(fetchedStages);
      }
      if (dealsRes.ok) {
        const data = await dealsRes.json();
        fetchedDeals = data.deals ?? [];
        setDeals(fetchedDeals);
      }
      if (contactsRes.ok) {
        const { contacts } = await contactsRes.json();
        setContacts(contacts);
      }
      if (highlightsRes.ok) {
        const { highlighted_deal_ids } = await highlightsRes.json();
        setHighlightedDealIds(new Set(highlighted_deal_ids ?? []));
      }

      // Show sample deals if no real deals exist
      if (fetchedDeals.length === 0 && fetchedStages.length > 0) {
        setDeals(makeSampleDeals(fetchedStages));
        setUsingSamples(true);
      } else {
        setUsingSamples(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleMoveDeal(dealId: string, newStageId: string) {
    // Optimistic update
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? { ...d, stage_id: newStageId, stage: stages.find((s) => s.id === newStageId) ?? d.stage }
          : d
      )
    );

    const res = await fetch(`/api/deals/${dealId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: newStageId }),
    });

    if (!res.ok) {
      toast.error("Failed to move deal");
      fetchData();
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="flex gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="min-w-[260px] h-[300px] rounded-xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
            Drag deals between stages. Filter by BD, Marketing, or Admin board.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-0.5 rounded-lg border border-white/10 p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "kanban" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="Kanban view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "list" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Board filter */}
          <div className="flex gap-1 overflow-x-auto">
            {BOARDS.map((tab) => {
              const count = tab === "All" ? deals.length : deals.filter((d) => d.board_type === tab).length;
              return (
                <button
                  key={tab}
                  onClick={() => setBoard(tab)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                    board === tab
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  {tab}
                  {count > 0 && !usingSamples && (
                    <span className="ml-1 text-muted-foreground/60">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Add Deal
          </Button>
        </div>
      </div>

      {usingSamples && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-muted-foreground">
          Showing sample deals. Add your first deal to get started.
        </div>
      )}

      {viewMode === "kanban" ? (
        <KanbanBoard
          stages={stages}
          deals={deals}
          board={board}
          onMoveDeal={handleMoveDeal}
          onDealClick={setSelectedDeal}
          highlightDealId={highlightDealId}
          highlightedDealIds={highlightedDealIds}
        />
      ) : (
        <DealListView
          deals={deals}
          stages={stages}
          board={board}
          onDealClick={setSelectedDeal}
          highlightDealId={highlightDealId}
          highlightedDealIds={highlightedDealIds}
        />
      )}

      <CreateDealModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        stages={stages}
        contacts={contacts}
        onCreated={fetchData}
      />

      <DealDetailPanel
        deal={selectedDeal}
        open={!!selectedDeal}
        onClose={() => setSelectedDeal(null)}
        onDeleted={fetchData}
        onUpdated={fetchData}
      />
    </div>
  );
}
