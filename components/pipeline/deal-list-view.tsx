"use client";

import type { Deal, PipelineStage, BoardType } from "@/lib/types";
import { cn } from "@/lib/utils";

type DealListViewProps = {
  deals: Deal[];
  stages: PipelineStage[];
  board: BoardType;
  onDealClick: (deal: Deal) => void;
  highlightDealId?: string | null;
  highlightedDealIds?: Set<string>;
};

export function DealListView({ deals, stages, board, onDealClick, highlightDealId, highlightedDealIds }: DealListViewProps) {
  const filtered = board === "All" ? deals : deals.filter((d) => d.board_type === board);

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
        <p className="text-sm text-muted-foreground">No deals to show.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
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
            return (
              <tr
                key={deal.id}
                data-deal-id={deal.id}
                onClick={() => onDealClick(deal)}
                className={cn(
                  "border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.04]",
                  deal.id === highlightDealId && "bg-primary/10 ring-1 ring-primary/30",
                  highlightedDealIds?.has(deal.id) && deal.id !== highlightDealId && "bg-amber-500/5 border-l-2 border-l-amber-400"
                )}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{deal.deal_name}</p>
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
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
