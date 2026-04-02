"use client";

import * as React from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import type { Deal, PipelineStage, BoardType } from "@/lib/types";
import { KanbanColumn } from "./kanban-column";
import { DealHoverPreview } from "./deal-hover-preview";


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
  highlightDetails?: Record<string, { priority?: string; sentiment?: string; message_count?: number; sender_name?: string }>;
  unreadCounts?: Record<string, number>;
};

export function KanbanBoard({
  stages, deals, allDeals, board, onMoveDeal, onDealClick,
  onQuickMove, onQuickOutcome, onInlineEdit,
  selectedDealIds, onToggleSelect,
  highlightDealId, highlightedDealIds, highlightDetails,
  unreadCounts,
}: KanbanBoardProps) {
  const filteredDeals = board === "All" ? deals : deals.filter((d) => d.board_type === board);
  const allFilteredDeals = board === "All" ? allDeals : allDeals.filter((d) => d.board_type === board);
  const [collapsedColumns, setCollapsedColumns] = React.useState<Set<string>>(new Set());
  const [slamDealId, setSlamDealId] = React.useState<string | null>(null);
  const [rippleStageId, setRippleStageId] = React.useState<string | null>(null);
  const [hoverDeal, setHoverDeal] = React.useState<Deal | null>(null);
  const [hoverRect, setHoverRect] = React.useState<DOMRect | null>(null);
  const slamTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => { if (slamTimerRef.current) clearTimeout(slamTimerRef.current); };
  }, []);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const dealId = result.draggableId;
    const newStageId = result.destination.droppableId;
    if (result.source.droppableId === newStageId) return;
    onMoveDeal(dealId, newStageId);
    setSlamDealId(dealId);
    setRippleStageId(newStageId);
    if (slamTimerRef.current) clearTimeout(slamTimerRef.current);
    slamTimerRef.current = setTimeout(() => { setSlamDealId(null); setRippleStageId(null); }, 400);
  }

  function toggleCollapse(stageId: string) {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      next.has(stageId) ? next.delete(stageId) : next.add(stageId);
      return next;
    });
  }

  // Pipeline summary: value per stage for the weighted bar
  const totalPipelineValue = allFilteredDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const stageStats = stages.map((stage) => {
    const stageDeals = allFilteredDeals.filter((d) => d.stage_id === stage.id);
    const value = stageDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
    const weighted = stageDeals.reduce((s, d) => s + Number(d.value ?? 0) * (Number(d.probability ?? 50) / 100), 0);
    return { stage, count: stageDeals.length, value, weighted };
  });
  const totalWeightedValue = stageStats.reduce((s, st) => s + st.weighted, 0);

  return (
    <div className="space-y-3">
      {/* Weighted pipeline bar */}
      {totalPipelineValue > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Pipeline: <span className="text-foreground font-medium">${Math.round(totalPipelineValue).toLocaleString()}</span></span>
            <span>Weighted: <span className="text-emerald-400 font-medium">${Math.round(totalWeightedValue).toLocaleString()}</span></span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-white/5 gap-px">
            {stageStats.map((st) => {
              const pct = totalPipelineValue > 0 ? (st.value / totalPipelineValue) * 100 : 0;
              if (pct < 0.5) return null;
              return (
                <div
                  key={st.stage.id}
                  className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: st.stage.color ?? "hsl(var(--primary))",
                    opacity: 0.6 + (st.stage.position / stages.length) * 0.4,
                  }}
                  title={`${st.stage.name}: $${Math.round(st.value).toLocaleString()} (${st.count} deals)`}
                />
              );
            })}
          </div>
          <div className="flex gap-3 flex-wrap">
            {stageStats.filter((st) => st.count > 0).map((st) => (
              <span key={st.stage.id} className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: st.stage.color ?? "hsl(var(--primary))" }} />
                {st.stage.name}: {st.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <DealHoverPreview deal={hoverDeal} anchorRect={hoverRect} />
      <DragDropContext onDragStart={() => { setHoverDeal(null); setHoverRect(null); }} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 thin-scroll">
          {stages.map((stage) => {
            const stageDeals = filteredDeals.filter((d) => d.stage_id === stage.id);
            const allStageDeals = allFilteredDeals.filter((d) => d.stage_id === stage.id);
            const isCollapsed = collapsedColumns.has(stage.id);
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
                highlightDetails={highlightDetails}
                collapsed={isCollapsed}
                onToggleCollapse={() => toggleCollapse(stage.id)}
                unreadCounts={unreadCounts}
                slamDealId={slamDealId}
                ripple={rippleStageId === stage.id}
                onHoverPreview={(deal, rect) => { setHoverDeal(deal); setHoverRect(rect); }}
                onHoverEnd={() => { setHoverDeal(null); setHoverRect(null); }}
              />
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
