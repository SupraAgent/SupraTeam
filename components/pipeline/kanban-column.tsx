"use client";

import { Droppable } from "@hello-pangea/dnd";
import type { Deal, PipelineStage } from "@/lib/types";
import { DealCard } from "./deal-card";

type KanbanColumnProps = {
  stage: PipelineStage;
  deals: Deal[];
  allStageDealsCount: number;
  stages: PipelineStage[];
  onDealClick: (deal: Deal) => void;
  onQuickMove: (dealId: string, stageId: string) => void;
  onQuickOutcome: (dealId: string, outcome: string) => void;
  onInlineEdit: (dealId: string, field: string, value: number | null) => void;
  selectedDealIds: Set<string>;
  onToggleSelect: (dealId: string) => void;
  highlightDealId?: string | null;
  highlightedDealIds?: Set<string>;
};

function avgDaysInStage(deals: Deal[]): number | null {
  if (deals.length === 0) return null;
  const now = Date.now();
  const total = deals.reduce((sum, d) => {
    const changed = new Date(d.stage_changed_at).getTime();
    return sum + (now - changed) / 86400000;
  }, 0);
  return Math.round(total / deals.length);
}

export function KanbanColumn({
  stage, deals, allStageDealsCount, stages,
  onDealClick, onQuickMove, onQuickOutcome, onInlineEdit,
  selectedDealIds, onToggleSelect,
  highlightDealId, highlightedDealIds,
}: KanbanColumnProps) {
  const totalValue = deals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const avgDays = avgDaysInStage(deals);

  return (
    <div className="min-w-[260px] w-[260px] flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col max-h-[calc(100vh-180px)]">
      <div className="border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stage.color && (
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
            )}
            <span className="text-xs font-medium text-foreground">{stage.name}</span>
          </div>
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {deals.length}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {totalValue > 0 && (
            <span className="text-[10px] text-muted-foreground/60">${Math.round(totalValue).toLocaleString()}</span>
          )}
          {avgDays != null && avgDays > 0 && (
            <span className={`text-[10px] ${avgDays > 14 ? "text-amber-400/70" : "text-muted-foreground/40"}`}>
              avg {avgDays}d
            </span>
          )}
        </div>
      </div>

      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2 space-y-2 overflow-y-auto thin-scroll min-h-[60px] transition-colors ${
              snapshot.isDraggingOver ? "bg-primary/5" : ""
            }`}
          >
            {deals.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-[60px]">
                <p className="text-[11px] text-muted-foreground/40">No deals</p>
              </div>
            )}
            {deals.map((deal, index) => (
              <DealCard
                key={deal.id}
                deal={deal}
                index={index}
                stages={stages}
                onClick={() => onDealClick(deal)}
                onQuickMove={(stageId) => onQuickMove(deal.id, stageId)}
                onQuickOutcome={(outcome) => onQuickOutcome(deal.id, outcome)}
                onInlineEdit={(field, val) => onInlineEdit(deal.id, field, val)}
                selected={selectedDealIds.has(deal.id)}
                onToggleSelect={() => onToggleSelect(deal.id)}
                highlight={deal.id === highlightDealId}
                tgHighlight={highlightedDealIds?.has(deal.id) ?? false}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
