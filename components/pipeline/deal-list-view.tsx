"use client";

import type { Deal, PipelineStage, BoardType } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { Snowflake } from "lucide-react";

function getColdWeeks(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const weeks = Math.floor(ms / (7 * 86400000));
  return Math.min(Math.max(weeks, 0), 8);
}

type DealListViewProps = {
  deals: Deal[];
  stages: PipelineStage[];
  board: BoardType;
  onDealClick: (deal: Deal) => void;
  selectedDealIds?: Set<string>;
  onToggleSelect?: (dealId: string) => void;
  highlightDealId?: string | null;
  highlightedDealIds?: Set<string>;
};

export function DealListView({ deals, stages, board, onDealClick, selectedDealIds, onToggleSelect, highlightDealId, highlightedDealIds }: DealListViewProps) {
  const filtered = board === "All" ? deals : deals.filter((d) => d.board_type === board);

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
        <p className="text-sm text-muted-foreground">No deals to show.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {onToggleSelect && <th className="w-8 px-2 py-2.5" />}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Deal</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Contact</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Board</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Stage</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Value</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((deal) => {
              const stage = deal.stage ?? stages.find((s) => s.id === deal.stage_id);
              const coldWeeks = getColdWeeks(deal.updated_at);
              const iceClass = coldWeeks >= 1 ? `ice-stage-${coldWeeks}` : null;
              return (
                <tr
                  key={deal.id}
                  data-deal-id={deal.id}
                  onClick={() => onDealClick(deal)}
                  className={cn(
                    "border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.04]",
                    deal.id === highlightDealId && "bg-primary/10 ring-1 ring-primary/30",
                    highlightedDealIds?.has(deal.id) && deal.id !== highlightDealId && "bg-amber-500/5 border-l-2 border-l-amber-400",
                    iceClass
                  )}
                >
                  {onToggleSelect && (
                    <td className="w-8 px-2 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleSelect(deal.id); }}
                        className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center transition-colors",
                          selectedDealIds?.has(deal.id)
                            ? "bg-primary border-primary text-white"
                            : "border-white/20 hover:border-white/40"
                        )}
                      >
                        {selectedDealIds?.has(deal.id) && (
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        )}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-foreground">{deal.deal_name}</p>
                      {coldWeeks >= 1 && (
                        <span className="ice-badge relative z-10 flex items-center gap-0.5" title={`${coldWeeks}w without activity`}>
                          <Snowflake className="h-2.5 w-2.5" />{coldWeeks}w
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {deal.contact ? (
                      <span>
                        {deal.contact.name}
                        {deal.contact.telegram_username && (
                          <span className="ml-1 text-blue-400">@{deal.contact.telegram_username}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
                      deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
                      deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
                    )}>
                      {deal.board_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {stage ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${stage.color}20`,
                          color: stage.color ?? undefined,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: stage.color ?? undefined }}
                        />
                        {stage.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {deal.value != null && deal.value > 0
                      ? `$${Number(deal.value).toLocaleString()}`
                      : "--"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {timeAgo(deal.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {filtered.map((deal) => {
          const stage = deal.stage ?? stages.find((s) => s.id === deal.stage_id);
          const coldWeeks = getColdWeeks(deal.updated_at);
          const iceClass = coldWeeks >= 1 ? `ice-stage-${coldWeeks}` : null;
          return (
            <div
              key={deal.id}
              data-deal-id={deal.id}
              onClick={() => onDealClick(deal)}
              className={cn(
                "rounded-xl border border-white/10 bg-white/[0.035] p-3 cursor-pointer transition hover:bg-white/[0.06] active:bg-white/[0.08]",
                deal.id === highlightDealId && "bg-primary/10 ring-1 ring-primary/30",
                highlightedDealIds?.has(deal.id) && deal.id !== highlightDealId && "bg-amber-500/5 border-l-2 border-l-amber-400",
                iceClass
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{deal.deal_name}</p>
                <span className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
                  deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
                  deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
                )}>
                  {deal.board_type}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                {stage && (
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${stage.color}20`, color: stage.color ?? undefined }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stage.color ?? undefined }} />
                    {stage.name}
                  </span>
                )}
                {deal.value != null && deal.value > 0 && (
                  <span className="text-xs text-muted-foreground">${Number(deal.value).toLocaleString()}</span>
                )}
                {coldWeeks >= 1 && (
                  <span className="ice-badge relative z-10 flex items-center gap-0.5" title={`${coldWeeks}w without activity`}>
                    <Snowflake className="h-2.5 w-2.5" />{coldWeeks}w
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/50 ml-auto">{timeAgo(deal.updated_at)}</span>
              </div>
              {deal.contact && (
                <p className="mt-1 text-[11px] text-muted-foreground truncate">
                  {deal.contact.name}
                  {deal.contact.telegram_username && <span className="text-blue-400 ml-1">@{deal.contact.telegram_username}</span>}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
