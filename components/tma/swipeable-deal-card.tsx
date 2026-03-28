"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { hapticImpact, hapticNotification, hapticSelection } from "./haptic";

const SWIPE_THRESHOLD = 80; // px to trigger stage change
const LONG_PRESS_MS = 500;

interface Stage {
  id: string;
  name: string;
  position: number;
  color: string;
}

interface Deal {
  id: string;
  deal_name: string;
  board_type: string;
  stage_id: string | null;
  value: number | null;
  contact: { name: string } | null;
  stage: { id: string; name: string; color: string; position: number } | null;
}

interface SwipeableDealCardProps {
  deal: Deal;
  stages: Stage[];
  onStageChange: (dealId: string, newStageId: string) => Promise<void>;
  onLongPress: (deal: Deal, rect: DOMRect) => void;
}

export function SwipeableDealCard({ deal, stages, onStageChange, onLongPress }: SwipeableDealCardProps) {
  const [offsetX, setOffsetX] = React.useState(0);
  const [swiping, setSwiping] = React.useState(false);
  const [undoStage, setUndoStage] = React.useState<{ stageId: string; stageName: string } | null>(null);
  const touchStartX = React.useRef(0);
  const touchStartY = React.useRef(0);
  const isHorizontal = React.useRef<boolean | null>(null);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const sortedStages = React.useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages]
  );

  const currentPos = deal.stage ? sortedStages.findIndex((s) => s.id === deal.stage?.id) : -1;
  const prevStage = currentPos > 0 ? sortedStages[currentPos - 1] : null;
  const nextStage = currentPos < sortedStages.length - 1 ? sortedStages[currentPos + 1] : null;

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    setSwiping(true);

    // Long press detection
    longPressTimer.current = setTimeout(() => {
      hapticImpact("heavy");
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) onLongPress(deal, rect);
      setSwiping(false);
      setOffsetX(0);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    clearLongPress();
    if (!swiping) return;

    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Determine direction on first significant movement
    if (isHorizontal.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontal.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
      return;
    }

    if (!isHorizontal.current) {
      setSwiping(false);
      return;
    }

    // Clamp swipe range, prevent swiping in invalid direction
    let clampedX = deltaX;
    if (deltaX > 0 && !nextStage) clampedX = deltaX * 0.2; // Rubber band if no next stage
    if (deltaX < 0 && !prevStage) clampedX = deltaX * 0.2; // Rubber band if no prev stage
    clampedX = Math.max(-150, Math.min(150, clampedX));

    setOffsetX(clampedX);

    // Haptic at threshold
    if (Math.abs(clampedX) >= SWIPE_THRESHOLD && Math.abs(deltaX - clampedX) < 5) {
      hapticSelection();
    }
  };

  const handleTouchEnd = async () => {
    clearLongPress();

    if (Math.abs(offsetX) >= SWIPE_THRESHOLD) {
      const targetStage = offsetX > 0 ? nextStage : prevStage;
      if (targetStage) {
        hapticNotification("success");
        const oldStageId = deal.stage_id;
        const oldStageName = deal.stage?.name ?? "Unknown";
        setUndoStage({ stageId: oldStageId ?? "", stageName: oldStageName });
        await onStageChange(deal.id, targetStage.id);

        // Auto-dismiss undo after 5s
        setTimeout(() => setUndoStage(null), 5000);
      }
    }

    setOffsetX(0);
    setSwiping(false);
  };

  const handleUndo = async () => {
    if (!undoStage) return;
    hapticImpact("light");
    await onStageChange(deal.id, undoStage.stageId);
    setUndoStage(null);
  };

  // Determine swipe hint labels
  const swipeLabel = offsetX > SWIPE_THRESHOLD / 2 && nextStage
    ? nextStage.name
    : offsetX < -SWIPE_THRESHOLD / 2 && prevStage
      ? prevStage.name
      : null;

  return (
    <div ref={cardRef} className="relative overflow-hidden">
      {/* Background hint (visible behind card during swipe) */}
      {offsetX !== 0 && (
        <div
          className={cn(
            "absolute inset-0 flex items-center px-4 text-xs font-medium",
            offsetX > 0 ? "justify-end bg-green-500/20 text-green-400" : "justify-start bg-orange-500/20 text-orange-400"
          )}
        >
          {swipeLabel && <span>{offsetX > 0 ? "→" : "←"} {swipeLabel}</span>}
        </div>
      )}

      {/* Card content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative bg-[hsl(225,35%,5%)] transition-transform"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 200ms ease-out",
        }}
      >
        <Link
          href={`/tma/deals/${deal.id}`}
          className="flex items-center justify-between px-3 py-2.5 transition active:bg-white/[0.04]"
          onClick={(e) => {
            // Prevent navigation during swipe
            if (Math.abs(offsetX) > 5) e.preventDefault();
          }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{deal.deal_name}</p>
            {deal.contact && (
              <p className="text-[10px] text-muted-foreground">{deal.contact.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[10px]",
              deal.board_type === "BD" ? "text-blue-400" : deal.board_type === "Marketing" ? "text-purple-400" : "text-orange-400"
            )}>
              {deal.board_type}
            </span>
            {deal.value != null && deal.value > 0 && (
              <span className="text-[10px] text-muted-foreground">${Number(deal.value).toLocaleString()}</span>
            )}
            <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
          </div>
        </Link>
      </div>

      {/* Undo toast */}
      {undoStage && (
        <div className="absolute inset-x-0 bottom-0 bg-white/10 backdrop-blur-sm px-3 py-1.5 flex items-center justify-between z-10">
          <span className="text-[10px] text-muted-foreground">Moved from {undoStage.stageName}</span>
          <button
            onClick={handleUndo}
            className="text-[10px] font-medium text-primary"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
