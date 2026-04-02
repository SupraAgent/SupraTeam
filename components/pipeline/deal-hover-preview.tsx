"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { Deal } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, MessageCircle } from "lucide-react";

interface DealHoverPreviewProps {
  deal: Deal | null;
  anchorRect: DOMRect | null;
}

export function DealHoverPreview({ deal, anchorRect }: DealHoverPreviewProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  if (!mounted || !deal || !anchorRect) return null;

  // Position: right of card, or left if near right edge
  const gap = 8;
  const previewWidth = 280;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const placeRight = anchorRect.right + gap + previewWidth < viewportWidth;
  const left = placeRight ? anchorRect.right + gap : anchorRect.left - gap - previewWidth;
  const top = Math.max(8, Math.min(anchorRect.top, (typeof window !== "undefined" ? window.innerHeight : 800) - 320));

  const sentiment = deal.ai_sentiment as { momentum?: string; overall_sentiment?: string } | null;

  return createPortal(
    <div
      className="fixed z-[9999] w-[280px] rounded-xl border border-white/10 bg-[hsl(225,35%,10%)] shadow-2xl p-4 space-y-3 animate-slide-up pointer-events-none"
      style={{ left, top }}
    >
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-foreground truncate">{deal.deal_name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
            deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
            deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
          )}>
            {deal.board_type}
          </span>
          {deal.stage && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {deal.stage.color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.stage.color }} />}
              {deal.stage.name}
            </span>
          )}
        </div>
      </div>

      {/* Contact */}
      {deal.contact && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p className="text-foreground/80">{deal.contact.name}</p>
          {deal.contact.company && <p>{deal.contact.company}</p>}
          {deal.contact.telegram_username && (
            <p className="flex items-center gap-1">
              <MessageCircle className="h-2.5 w-2.5" />@{deal.contact.telegram_username}
            </p>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs">
        {deal.value != null && deal.value > 0 && (
          <span className="text-foreground font-medium">${Number(deal.value).toLocaleString()}</span>
        )}
        {deal.probability != null && deal.probability > 0 && (
          <span className="text-muted-foreground">{deal.probability}% prob</span>
        )}
      </div>

      {/* Health bar */}
      {deal.health_score != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Health</span>
            <span className={cn(
              deal.health_score >= 70 ? "text-green-400" : deal.health_score >= 40 ? "text-amber-400" : "text-red-400"
            )}>
              {deal.health_score}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                deal.health_score >= 70 ? "bg-green-400" : deal.health_score >= 40 ? "bg-amber-400" : "bg-red-400"
              )}
              style={{ width: `${deal.health_score}%` }}
            />
          </div>
        </div>
      )}

      {/* Sentiment */}
      {sentiment?.momentum && (
        <div className="flex items-center gap-1.5 text-[10px]">
          {sentiment.momentum === "accelerating" ? (
            <><TrendingUp className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Accelerating</span></>
          ) : sentiment.momentum === "declining" ? (
            <><TrendingDown className="h-3 w-3 text-red-400" /><span className="text-red-400">Declining</span></>
          ) : sentiment.momentum === "stalling" ? (
            <><Minus className="h-3 w-3 text-amber-400" /><span className="text-amber-400">Stalling</span></>
          ) : (
            <><Minus className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Stable</span></>
          )}
          {sentiment.overall_sentiment && (
            <span className="text-muted-foreground/60 ml-1">({sentiment.overall_sentiment})</span>
          )}
        </div>
      )}

      {/* AI Summary */}
      {deal.ai_summary && (
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-3">
          {deal.ai_summary}
        </p>
      )}

      {/* Footer: last activity + assigned */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 pt-1 border-t border-white/5">
        <span>Updated {timeAgo(deal.updated_at)}</span>
        {deal.assigned_profile && (
          <span className="flex items-center gap-1">
            <img src={deal.assigned_profile.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full" />
            {deal.assigned_profile.display_name}
          </span>
        )}
      </div>
    </div>,
    document.body
  );
}
