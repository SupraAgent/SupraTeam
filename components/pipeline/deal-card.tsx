"use client";

import * as React from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { Deal, PipelineStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MessageCircle, Snowflake, MoreHorizontal, ArrowRight, Trophy, XCircle, Check, X, TrendingUp, TrendingDown, Minus } from "lucide-react";

type DealCardProps = {
  deal: Deal;
  index: number;
  stages: PipelineStage[];
  onClick: () => void;
  onQuickMove: (stageId: string) => void;
  onQuickOutcome: (outcome: string) => void;
  onInlineEdit: (field: string, value: number | null) => void;
  selected: boolean;
  onToggleSelect: () => void;
  highlight?: boolean;
  tgHighlight?: boolean;
};

function getColdWeeks(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const weeks = Math.floor(ms / (7 * 86400000));
  return Math.min(Math.max(weeks, 0), 8);
}

export function DealCard({
  deal, index, stages, onClick,
  onQuickMove, onQuickOutcome, onInlineEdit,
  selected, onToggleSelect,
  highlight, tgHighlight,
}: DealCardProps) {
  const coldWeeks = getColdWeeks(deal.updated_at);
  const iceClass = coldWeeks >= 1 ? `ice-stage-${coldWeeks}` : null;
  const [showMenu, setShowMenu] = React.useState(false);
  const [editingField, setEditingField] = React.useState<"value" | "probability" | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  function startEdit(field: "value" | "probability", e: React.MouseEvent) {
    e.stopPropagation();
    setEditingField(field);
    setEditValue(field === "value" ? String(deal.value ?? "") : String(deal.probability ?? ""));
  }

  function commitEdit(e?: React.FormEvent) {
    e?.preventDefault();
    if (editingField) {
      const num = editValue === "" ? null : Number(editValue);
      onInlineEdit(editingField, isNaN(num as number) ? null : num);
      setEditingField(null);
    }
  }

  function cancelEdit() {
    setEditingField(null);
  }

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          data-deal-id={deal.id}
          className={cn(
            "group rounded-lg border bg-white/[0.04] p-3 cursor-pointer transition-all hover:bg-white/[0.07] relative",
            snapshot.isDragging && "shadow-lg border-primary/30 bg-white/[0.08]",
            highlight && "ring-2 ring-primary border-primary/40 bg-primary/10 animate-pulse",
            tgHighlight && !highlight && "border-amber-400/40 bg-amber-500/5 ring-1 ring-amber-400/30",
            selected && "ring-2 ring-primary/60 border-primary/40 bg-primary/5",
            !highlight && !tgHighlight && !selected && !iceClass && "border-white/10",
            !highlight && !tgHighlight && !selected && iceClass
          )}
        >
          {/* Selection checkbox — visible on hover or when selected */}
          <div
            className={cn(
              "absolute -left-0.5 -top-0.5 z-10",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
              className={cn(
                "h-5 w-5 rounded border flex items-center justify-center transition-colors",
                selected
                  ? "bg-primary border-primary text-white"
                  : "border-white/20 bg-white/5 hover:border-white/40"
              )}
            >
              {selected && <Check className="h-3 w-3" />}
            </button>
          </div>

          {/* Quick actions menu — visible on hover */}
          <div className="absolute right-1.5 top-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="h-5 w-5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-6 rounded-lg border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl py-1 min-w-[160px] z-50">
                {/* Move to stage submenu */}
                <div className="px-2 py-1 text-[10px] text-muted-foreground/50 uppercase tracking-wider">Move to</div>
                {stages.map((s) => (
                  <button
                    key={s.id}
                    onClick={(e) => { e.stopPropagation(); onQuickMove(s.id); setShowMenu(false); }}
                    disabled={s.id === deal.stage_id}
                    className={cn(
                      "w-full text-left px-3 py-1 text-xs flex items-center gap-2",
                      s.id === deal.stage_id
                        ? "text-muted-foreground/30 cursor-default"
                        : "text-foreground hover:bg-white/10"
                    )}
                  >
                    {s.color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />}
                    {s.name}
                    {s.id === deal.stage_id && <span className="ml-auto text-[9px] text-muted-foreground/30">current</span>}
                  </button>
                ))}

                <div className="border-t border-white/10 my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickOutcome("won"); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-green-400 hover:bg-white/10 flex items-center gap-2"
                >
                  <Trophy className="h-3 w-3" /> Mark Won
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickOutcome("lost"); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 flex items-center gap-2"
                >
                  <XCircle className="h-3 w-3" /> Mark Lost
                </button>
              </div>
            )}
          </div>

          <div onClick={onClick}>
            <div className="flex items-start justify-between gap-1 pr-6">
              <p className="text-sm font-medium text-foreground truncate">{deal.deal_name}</p>
              {tgHighlight && (
                <MessageCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              )}
            </div>

            {deal.contact && (
              <p className="mt-1 text-xs text-muted-foreground truncate">
                {deal.contact.name}
                {deal.contact.company && ` - ${deal.contact.company}`}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
              deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
              deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
            )}>
              {deal.board_type}
            </span>

            {/* Outcome badge */}
            {deal.outcome === "won" && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400">Won</span>
            )}
            {deal.outcome === "lost" && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400">Lost</span>
            )}

            {/* Health dot */}
            {deal.health_score != null && deal.outcome !== "won" && deal.outcome !== "lost" && (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  deal.health_score >= 70 ? "bg-green-400" : deal.health_score >= 40 ? "bg-amber-400" : "bg-red-400"
                )}
                title={`Health: ${deal.health_score}%`}
              />
            )}

            {/* Sentiment momentum indicator */}
            {deal.ai_sentiment && deal.outcome !== "won" && deal.outcome !== "lost" && (() => {
              const s = deal.ai_sentiment as { momentum?: string; overall_sentiment?: string };
              if (!s.momentum) return null;
              const icon = s.momentum === "accelerating" ? <TrendingUp className="h-2.5 w-2.5" /> :
                           s.momentum === "declining" || s.momentum === "stalling" ? <TrendingDown className="h-2.5 w-2.5" /> :
                           <Minus className="h-2.5 w-2.5" />;
              const color = s.momentum === "accelerating" ? "text-emerald-400" :
                            s.momentum === "declining" ? "text-red-400" :
                            s.momentum === "stalling" ? "text-amber-400" : "text-muted-foreground/50";
              return (
                <span className={cn("flex items-center", color)} title={`Momentum: ${s.momentum}`}>
                  {icon}
                </span>
              );
            })()}

            {/* Inline-editable value */}
            {editingField === "value" ? (
              <form onSubmit={commitEdit} className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] text-muted-foreground">$</span>
                <input
                  autoFocus
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                  className="w-16 h-4 bg-white/10 border border-white/20 rounded px-1 text-[10px] text-foreground outline-none"
                />
              </form>
            ) : deal.value != null && deal.value > 0 ? (
              <button
                onClick={(e) => startEdit("value", e)}
                className="text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 rounded px-0.5 transition-colors"
                title="Click to edit value"
              >
                ${Number(deal.value).toLocaleString()}
              </button>
            ) : null}

            {coldWeeks >= 1 && (
              <span
                className="ice-badge relative z-10 flex items-center gap-0.5"
                title={`${coldWeeks}w without activity`}
              >
                <Snowflake className="h-2.5 w-2.5" />{coldWeeks}w
              </span>
            )}

            {/* Inline-editable probability */}
            {editingField === "probability" ? (
              <form onSubmit={commitEdit} className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  max={100}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                  className="w-10 h-4 bg-white/10 border border-white/20 rounded px-1 text-[9px] text-foreground outline-none"
                />
                <span className="text-[9px] text-muted-foreground/50">%</span>
              </form>
            ) : deal.probability != null && deal.probability > 0 ? (
              <button
                onClick={(e) => startEdit("probability", e)}
                className="text-[9px] text-muted-foreground/50 hover:text-foreground hover:bg-white/10 rounded px-0.5 transition-colors"
                title="Click to edit probability"
              >
                {deal.probability}%
              </button>
            ) : null}

            {deal.assigned_profile && (
              <img
                src={deal.assigned_profile.avatar_url}
                alt={deal.assigned_profile.display_name}
                title={deal.assigned_profile.display_name}
                className="ml-auto h-5 w-5 rounded-full"
              />
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
