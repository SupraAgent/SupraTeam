"use client";

import { Droppable } from "@hello-pangea/dnd";
import type { Deal, PipelineStage } from "@/lib/types";
import { DealCard } from "./deal-card";
import { cn } from "@/lib/utils";

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
  highlightDetails?: Record<string, { priority?: string; sentiment?: string; message_count?: number; sender_name?: string; message_preview?: string; triage_urgency?: string; triage_category?: string }>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  unreadCounts?: Record<string, number>;
  slamDealId?: string | null;
  ripple?: boolean;
  conversionRate?: number | null;
  onHoverPreview?: (deal: Deal, rect: DOMRect) => void;
  onHoverEnd?: () => void;
  sortByUrgency?: boolean;
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

// WIP limit — warn when column has more than this many deals
const WIP_LIMIT = 10;

export function KanbanColumn({
  stage, deals, allStageDealsCount, stages,
  onDealClick, onQuickMove, onQuickOutcome, onInlineEdit,
  selectedDealIds, onToggleSelect,
  highlightDealId, highlightedDealIds, highlightDetails,
  collapsed, onToggleCollapse,
  unreadCounts,
  slamDealId, ripple, conversionRate,
  onHoverPreview, onHoverEnd,
  sortByUrgency,
}: KanbanColumnProps) {
  // Sort by urgency: awaiting response first (oldest wait at top), then unread, then rest
  const sortedDeals = sortByUrgency ? [...deals].sort((a, b) => {
    const aWait = a.awaiting_response_since ? new Date(a.awaiting_response_since).getTime() : Infinity;
    const bWait = b.awaiting_response_since ? new Date(b.awaiting_response_since).getTime() : Infinity;
    if (aWait !== bWait) return aWait - bWait;
    const aUnread = unreadCounts?.[a.id] ?? 0;
    const bUnread = unreadCounts?.[b.id] ?? 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return 0;
  }) : deals;
  const totalValue = sortedDeals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const avgDays = avgDaysInStage(sortedDeals);
  const overWip = sortedDeals.length > WIP_LIMIT;
  const weightedValue = sortedDeals.reduce((s, d) => s + Number(d.value ?? 0) * (Number(d.probability ?? 50) / 100), 0);

  // Collapsed column — vertical label
  if (collapsed) {
    return (
      <div
        className="min-w-[40px] w-[40px] flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col items-center cursor-pointer hover:bg-white/[0.04] transition-colors max-h-[calc(100vh-180px)]"
        onClick={onToggleCollapse}
        title={`Expand ${stage.name}`}
      >
        <div className="py-3 px-1 flex flex-col items-center gap-2">
          {stage.color && (
            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          )}
          <span className="text-[10px] font-medium text-foreground [writing-mode:vertical-rl] rotate-180">
            {stage.name}
          </span>
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            overWip ? "bg-red-500/20 text-red-400" : "bg-white/10 text-muted-foreground"
          )}>
            {deals.length}
          </span>
          {totalValue > 0 && (
            <span className="text-[9px] text-muted-foreground/60 [writing-mode:vertical-rl] rotate-180">
              ${Math.round(totalValue / 1000)}k
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-w-[260px] w-[260px] flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col max-h-[calc(100vh-180px)]", ripple && "animate-column-ripple")}>
      <div
        className="border-b border-white/10 px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggleCollapse}
        title="Click to collapse column"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stage.color && (
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
            )}
            <span className="text-xs font-medium text-foreground">{stage.name}</span>
            {conversionRate != null && conversionRate > 0 && (
              <span className="text-[9px] text-muted-foreground/30 ml-1" title={`${conversionRate}% from previous stage`}>
                &larr;{conversionRate}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {overWip && (
              <span className="text-[9px] text-red-400 font-medium" title={`Over WIP limit of ${WIP_LIMIT}`}>
                WIP
              </span>
            )}
            {(() => {
              const highlightCount = highlightedDealIds
                ? deals.filter((d) => highlightedDealIds.has(d.id)).length
                : 0;
              return highlightCount > 0 ? (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400"
                  title={`${highlightCount} deal${highlightCount > 1 ? "s" : ""} need attention`}
                >
                  {highlightCount}
                </span>
              ) : null;
            })()}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              overWip ? "bg-red-500/20 text-red-400" : "bg-white/10 text-muted-foreground"
            )}>
              {deals.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {totalValue > 0 && (
            <span className="text-[10px] text-muted-foreground/60">${Math.round(totalValue).toLocaleString()}</span>
          )}
          {weightedValue > 0 && weightedValue !== totalValue && (
            <span className="text-[10px] text-emerald-400/50">~${Math.round(weightedValue).toLocaleString()}</span>
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
            {sortedDeals.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-[60px]">
                <p className="text-[11px] text-muted-foreground/40">No deals</p>
              </div>
            )}
            {sortedDeals.map((deal, index) => (
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
                tgHighlightDetails={highlightDetails?.[deal.id]}
                unreadCount={unreadCounts?.[deal.id]}
                slam={deal.id === slamDealId}
                onHoverPreview={onHoverPreview}
                onHoverEnd={onHoverEnd}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
