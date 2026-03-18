"use client";

import * as React from "react";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { CreateDealModal } from "@/components/pipeline/create-deal-modal";
import { DealDetailPanel } from "@/components/pipeline/deal-detail-panel";
import { Button } from "@/components/ui/button";
import type { Deal, PipelineStage, Contact, BoardType } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOARDS: BoardType[] = ["All", "BD", "Marketing", "Admin"];

export default function PipelinePage() {
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [board, setBoard] = React.useState<BoardType>("All");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    try {
      const [stagesRes, dealsRes, contactsRes] = await Promise.all([
        fetch("/api/pipeline"),
        fetch("/api/deals"),
        fetch("/api/contacts"),
      ]);

      if (stagesRes.ok) {
        const { stages } = await stagesRes.json();
        setStages(stages);
      }
      if (dealsRes.ok) {
        const { deals } = await dealsRes.json();
        setDeals(deals);
      }
      if (contactsRes.ok) {
        const { contacts } = await contactsRes.json();
        setContacts(contacts);
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
      // Revert on failure
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag deals between stages. Filter by BD, Marketing, or Admin board.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {BOARDS.map((tab) => (
              <button
                key={tab}
                onClick={() => setBoard(tab)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  board === tab
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Add Deal
          </Button>
        </div>
      </div>

      <KanbanBoard
        stages={stages}
        deals={deals}
        board={board}
        onMoveDeal={handleMoveDeal}
        onDealClick={setSelectedDeal}
      />

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
      />
    </div>
  );
}
