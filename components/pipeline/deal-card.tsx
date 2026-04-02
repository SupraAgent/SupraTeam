"use client";

import * as React from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { Deal, PipelineStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MessageCircle, Snowflake, MoreHorizontal, ArrowRight, Trophy, XCircle, Check, TrendingUp, TrendingDown, Minus, Clock, Flame } from "lucide-react";

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
  tgHighlightDetails?: { priority?: string; sentiment?: string; message_count?: number; sender_name?: string };
  unreadCount?: number;
  slam?: boolean;
  onHoverPreview?: (deal: Deal, rect: DOMRect) => void;
  onHoverEnd?: () => void;
};

// Response time threshold (hours) — will be configurable via SLA config in Stage 2
const RESPONSE_OVERDUE_HOURS = 4;
// Hot deal thresholds
const HOT_HEALTH_THRESHOLD = 80;

function getColdWeeks(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const weeks = Math.floor(ms / (7 * 86400000));
  return Math.min(Math.max(weeks, 0), 6);
}

export function DealCard({
  deal, index, stages, onClick,
  onQuickMove, onQuickOutcome, onInlineEdit,
  selected, onToggleSelect,
  highlight, tgHighlight, tgHighlightDetails, unreadCount,
  slam, onHoverPreview, onHoverEnd,
}: DealCardProps) {
  const coldWeeks = getColdWeeks(deal.updated_at);
  const iceClass = coldWeeks >= 1 ? `ice-stage-${coldWeeks}` : null;
  const isHotDeal = !iceClass && deal.outcome !== "won" && deal.outcome !== "lost" &&
    deal.health_score != null && deal.health_score >= HOT_HEALTH_THRESHOLD;
  const [showMenu, setShowMenu] = React.useState(false);
  const [editingField, setEditingField] = React.useState<"value" | "probability" | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const menuRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const commitPending = React.useRef(false);
  function commitEdit(e?: React.FormEvent) {
    e?.preventDefault();
    if (editingField && !commitPending.current) {
      commitPending.current = true;
      const num = editValue === "" ? null : Number(editValue);
      onInlineEdit(editingField, isNaN(num as number) ? null : num);
      setEditingField(null);
      // Reset guard after React flushes the state update
      queueMicrotask(() => { commitPending.current = false; });
    }
  }

  function cancelEdit() {
    setEditingField(null);
  }

  // Clean up hover timer on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Hover preview handlers
  function handleMouseEnter() {
    if (!onHoverPreview || !cardRef.current) return;
    hoverTimerRef.current = setTimeout(() => {
      if (cardRef.current) {
        onHoverPreview(deal, cardRef.current.getBoundingClientRect());
      }
    }, 400);
  }

  function handleMouseLeave() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    onHoverEnd?.();
  }

  // Response timer — ticks every 60s so the label stays current
  const [timerTick, setTimerTick] = React.useState(0);
  React.useEffect(() => {
    if (!deal.awaiting_response_since || deal.outcome === "won" || deal.outcome === "lost") return;
    const id = setInterval(() => setTimerTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [deal.awaiting_response_since, deal.outcome]);

  const responseTimer = React.useMemo(() => {
    if (!deal.awaiting_response_since || deal.outcome === "won" || deal.outcome === "lost") return null;
    const waitMs = Date.now() - new Date(deal.awaiting_response_since).getTime();
    const waitHours = waitMs / 3600000;
    const isOverdue = waitHours >= RESPONSE_OVERDUE_HOURS;
    const maxHours = RESPONSE_OVERDUE_HOURS * 2;
    const pct = Math.min(100, (waitHours / maxHours) * 100);
    const color = isOverdue ? "bg-red-400" : waitHours >= RESPONSE_OVERDUE_HOURS * 0.5 ? "bg-amber-400" : "bg-green-400";
    const label = waitHours >= 1 ? `${Math.floor(waitHours)}h ${Math.floor((waitMs % 3600000) / 60000)}m` : `${Math.floor(waitMs / 60000)}m`;
    return { pct, color, isOverdue, label, waitHours };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.awaiting_response_since, deal.outcome, timerTick]);

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={(el) => {
            provided.innerRef(el);
            (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          data-deal-id={deal.id}
          onMouseEnter={!snapshot.isDragging ? handleMouseEnter : undefined}
          onMouseLeave={handleMouseLeave}
          style={onHoverPreview && !snapshot.isDragging ? { cursor: "default" } : undefined}
          className={cn(
            "group rounded-lg border bg-white/[0.04] p-3 cursor-pointer transition-all hover:bg-white/[0.07] relative overflow-hidden",
            snapshot.isDragging && "shadow-lg border-primary/30 bg-white/[0.08]",
            highlight && "ring-2 ring-primary border-primary/40 bg-primary/10 animate-pulse",
            tgHighlight && !highlight && "border-amber-400/40 bg-amber-500/5 ring-1 ring-amber-400/30",
            selected && "ring-2 ring-primary/60 border-primary/40 bg-primary/5",
            !highlight && !tgHighlight && !selected && !iceClass && !isHotDeal && "border-white/10",
            !highlight && !tgHighlight && !selected && iceClass,
            !highlight && !tgHighlight && !selected && isHotDeal && "gold-hot",
            slam && "animate-drop-slam"
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
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{deal.deal_name}</p>
                {unreadCount && unreadCount > 0 ? (
                  <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-blue-500 text-white text-[9px] font-bold px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </div>
              {tgHighlight && (() => {
                const p = tgHighlightDetails?.priority;
                const iconColor = p === "urgent" ? "text-red-400" : p === "high" ? "text-orange-400" : "text-amber-400";
                const count = tgHighlightDetails?.message_count ?? 1;
                return (
                  <span className="flex items-center gap-0.5 shrink-0 mt-0.5">
                    <MessageCircle className={cn("h-3.5 w-3.5", iconColor)} />
                    {count > 1 && (
                      <span className={cn("text-[9px] font-bold", iconColor)}>{count}</span>
                    )}
                  </span>
                );
              })()}
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

            {/* Hot deal badge */}
            {isHotDeal && (
              <span
                className="gold-badge relative z-10 flex items-center gap-0.5"
                title={`Health: ${deal.health_score}%`}
              >
                <Flame className="h-2.5 w-2.5" />Hot
              </span>
            )}

            {/* Ice cold badge */}
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

            {/* Highlight sentiment dot */}
            {tgHighlight && tgHighlightDetails?.sentiment && tgHighlightDetails.sentiment !== "neutral" && (
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  tgHighlightDetails.sentiment === "negative" ? "bg-red-400" : "bg-emerald-400"
                )}
                title={`Sentiment: ${tgHighlightDetails.sentiment}`}
              />
            )}

            {deal.assigned_profile && (
              <img
                src={deal.assigned_profile.avatar_url}
                alt={deal.assigned_profile.display_name}
                title={deal.assigned_profile.display_name}
                className="ml-auto h-5 w-5 rounded-full"
              />
            )}
          </div>

          {/* Response time text indicator */}
          {responseTimer && (
            <div className={cn(
              "mt-1.5 flex items-center gap-1 text-[9px] font-medium rounded px-1.5 py-0.5",
              responseTimer.isOverdue ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
            )}>
              <Clock className="h-2.5 w-2.5" />
              Awaiting reply: {responseTimer.label}
            </div>
          )}

          {/* Response timer bar — thin progress bar at card bottom */}
          {responseTimer && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5 z-10">
              <div
                className={cn(
                  "h-full rounded-br-lg transition-all duration-1000",
                  responseTimer.color,
                  responseTimer.isOverdue && "response-timer-overdue"
                )}
                style={{ width: `${responseTimer.pct}%` }}
              />
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
