"use client";

import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import type { Deal, PipelineStage, BoardType } from "@/lib/types";
import { KanbanColumn } from "./kanban-column";

type KanbanBoardProps = {
  stages: PipelineStage[];
  deals: Deal[];
  board: BoardType;
  onMoveDeal: (dealId: string, newStageId: string) => void;
  onDealClick: (deal: Deal) => void;
  highlightDealId?: string | null;
  highlightedDealIds?: Set<string>;
};

export function KanbanBoard({ stages, deals, board, onMoveDeal, onDealClick, highlightDealId, highlightedDealIds }: KanbanBoardProps) {
  const filteredDeals = board === "All" ? deals : deals.filter((d) => d.board_type === board);

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
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              onDealClick={onDealClick}
              highlightDealId={highlightDealId}
              highlightedDealIds={highlightedDealIds}
            />
          );
        })}
      </div>
    </DragDropContext>
  );
}
