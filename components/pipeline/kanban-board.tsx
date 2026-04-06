"use client";

import * as React from "react";
import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { Deal, PipelineStage, BoardType } from "@/lib/types";
import { KanbanColumn } from "./kanban-column";
import { DealHoverPreview } from "./deal-hover-preview";
import { cn } from "@/lib/utils";
import { Zap, Clock } from "lucide-react";

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
  highlightDetails?: Record<string, { priority?: string; sentiment?: string; message_count?: number; sender_name?: string; message_preview?: string; triage_urgency?: string; triage_category?: string }>;
  unreadCounts?: Record<string, number>;
  onAutomateDeal?: (deal: Deal) => void;
};

export function KanbanBoard({
  stages, deals, allDeals, board, onMoveDeal, onDealClick,
  onQuickMove, onQuickOutcome, onInlineEdit,
  selectedDealIds, onToggleSelect,
  highlightDealId, highlightedDealIds, highlightDetails,
  unreadCounts, onAutomateDeal,
}: KanbanBoardProps) {
  const filteredDeals = board === "All" ? deals : deals.filter((d) => d.board_type === board);
  const allFilteredDeals = board === "All" ? allDeals : allDeals.filter((d) => d.board_type === board);
  const [collapsedColumns, setCollapsedColumns] = React.useState<Set<string>>(new Set());
  const [sortByUrgency, setSortByUrgency] = React.useState(false);
  const [slamDealId, setSlamDealId] = React.useState<string | null>(null);
  const [rippleStageId, setRippleStageId] = React.useState<string | null>(null);
  const [hoverDeal, setHoverDeal] = React.useState<Deal | null>(null);
  const [hoverRect, setHoverRect] = React.useState<DOMRect | null>(null);
  const slamTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [draggingDealName, setDraggingDealName] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => { if (slamTimerRef.current) clearTimeout(slamTimerRef.current); };
  }, []);

  function handleDragStart(start: { draggableId: string }) {
    setIsDragging(true);
    setHoverDeal(null);
    setHoverRect(null);
    const deal = filteredDeals.find((d) => d.id === start.draggableId);
    setDraggingDealName(deal?.deal_name ?? null);
  }

  function handleDragEnd(result: DropResult) {
    setIsDragging(false);
    setDraggingDealName(null);
    if (!result.destination) return;
    const dealId = result.draggableId;
    const destId = result.destination.droppableId;

    // Dropped on automation zone
    if (destId === "__automate__") {
      if (dealId.startsWith("sample-")) return;
      const deal = filteredDeals.find((d) => d.id === dealId);
      if (deal && onAutomateDeal) onAutomateDeal(deal);
      return;
    }

    if (result.source.droppableId === destId) return;
    onMoveDeal(dealId, destId);
    // Trigger slam + column ripple
    setSlamDealId(dealId);
    setRippleStageId(destId);
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

  const conversionRates = stageStats.map((st, i) => {
    if (i === 0 || stageStats[i - 1].count === 0) return null;
    return Math.round((st.count / stageStats[i - 1].count) * 100);
  });

  const awaitingCount = filteredDeals.filter((d) => d.awaiting_response_since && d.outcome !== "won" && d.outcome !== "lost").length;

  return (
    <div className="space-y-3">
      {/* Urgency sort toggle */}
      {awaitingCount > 0 && (
        <button
          onClick={() => setSortByUrgency((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
            sortByUrgency
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
              : "bg-white/5 text-muted-foreground hover:text-foreground border border-white/10"
          )}
        >
          <Clock className="h-3 w-3" />
          {awaitingCount} awaiting response
          {sortByUrgency && <span className="text-[9px] ml-1 opacity-70">(sorted)</span>}
        </button>
      )}

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
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 thin-scroll">
          {stages.map((stage, stageIndex) => {
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
                conversionRate={conversionRates[stageIndex]}
                sortByUrgency={sortByUrgency}
                onHoverPreview={(deal, rect) => { setHoverDeal(deal); setHoverRect(rect); }}
                onHoverEnd={() => { setHoverDeal(null); setHoverRect(null); }}
              />
            );
          })}
        </div>

        {/* Automation drop zone — visible only while dragging */}
        {onAutomateDeal && (
          <div className={cn(
            "transition-all duration-200 overflow-hidden",
            isDragging ? "max-h-32 opacity-100 mt-2" : "max-h-0 opacity-0"
          )}>
            <Droppable droppableId="__automate__">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "flex items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-all duration-200",
                    snapshot.isDraggingOver
                      ? "border-primary bg-primary/10 scale-[1.01]"
                      : "border-white/20 bg-white/[0.02]"
                  )}
                >
                  <Zap className={cn(
                    "h-5 w-5 transition-colors",
                    snapshot.isDraggingOver ? "text-primary" : "text-muted-foreground/60"
                  )} />
                  <span className={cn(
                    "text-sm font-medium transition-colors",
                    snapshot.isDraggingOver ? "text-primary" : "text-muted-foreground/60"
                  )}>
                    {snapshot.isDraggingOver
                      ? `Release to automate "${draggingDealName}"`
                      : "Drop here to automate"}
                  </span>
                  {/* Placeholder kept in flow but visually collapsed for correct drop calculations */}
                  <div style={{ height: 0, overflow: "hidden" }}>{provided.placeholder}</div>
                </div>
              )}
            </Droppable>
          </div>
        )}
      </DragDropContext>
    </div>
  );
}
