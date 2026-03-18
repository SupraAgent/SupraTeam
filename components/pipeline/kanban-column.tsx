"use client";

import { Droppable } from "@hello-pangea/dnd";
import type { Deal, PipelineStage } from "@/lib/types";
import { DealCard } from "./deal-card";

type KanbanColumnProps = {
  stage: PipelineStage;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
  highlightDealId?: string | null;
};

export function KanbanColumn({ stage, deals, onDealClick, highlightDealId }: KanbanColumnProps) {
  return (
    <div className="min-w-[260px] w-[260px] flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col max-h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
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
                onClick={() => onDealClick(deal)}
                highlight={deal.id === highlightDealId}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
