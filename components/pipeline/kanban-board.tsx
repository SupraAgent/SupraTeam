"use client";

import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import type { Deal, PipelineStage, BoardType } from "@/lib/types";
import { KanbanColumn } from "./kanban-column";

type KanbanBoardProps = {
  stages: PipelineStage[];
  deals: Deal[];
  allDeals: Deal[];
  board: BoardType;
  onMoveDeal: (dealId: string, newStageId: string) => void;
  onDealClick: (deal: Deal) => void;
  onQuickMove: (dealId: string, stageId: string) => void;
  onQuickOutcome: (dealId: string, outcome: string) => void;
  onInlineEdit: (dealId: string, field: string, value: number | null) => void;
  selectedDealIds: Set<string>;
  onToggleSelect: (dealId: string) => void;
  highlightDealId?: string | null;
  highlightedDealIds?: Set<string>;
};

export function KanbanBoard({
  stages, deals, allDeals, board, onMoveDeal, onDealClick,
  onQuickMove, onQuickOutcome, onInlineEdit,
  selectedDealIds, onToggleSelect,
  highlightDealId, highlightedDealIds,
}: KanbanBoardProps) {
  const filteredDeals = board === "All" ? deals : deals.filter((d) => d.board_type === board);
  const allFilteredDeals = board === "All" ? allDeals : allDeals.filter((d) => d.board_type === board);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const dealId = result.draggableId;
    const newStageId = result.destination.droppableId;
    if (result.source.droppableId === newStageId) return;
    onMoveDeal(dealId, newStageId);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 thin-scroll">
        {stages.map((stage) => {
          const stageDeals = filteredDeals.filter((d) => d.stage_id === stage.id);
          const allStageDeals = allFilteredDeals.filter((d) => d.stage_id === stage.id);
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              allStageDealsCount={allStageDeals.length}
              stages={stages}
              onDealClick={onDealClick}
              onQuickMove={onQuickMove}
              onQuickOutcome={onQuickOutcome}
              onInlineEdit={onInlineEdit}
              selectedDealIds={selectedDealIds}
              onToggleSelect={onToggleSelect}
              highlightDealId={highlightDealId}
              highlightedDealIds={highlightedDealIds}
            />
          );
        })}
      </div>
    </DragDropContext>
  );
}
