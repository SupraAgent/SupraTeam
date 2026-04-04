"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { ExternalLink, TrendingUp, TrendingDown, Minus, Clock, X } from "lucide-react";

interface Deal {
  id: string;
  deal_name: string;
  board_type: string;
  stage: { name: string; color: string } | null;
  assigned_to: string | null;
  contact: { id: string; name: string } | null;
  value?: number | null;
  probability?: number | null;
  health_score?: number | null;
  ai_summary?: string | null;
  ai_sentiment?: { momentum?: string; overall_sentiment?: string } | null;
  awaiting_response_since?: string | null;
  updated_at?: string;
}

interface DealContextSidebarProps {
  deals: Deal[];
  chatId: number;
  onClose: () => void;
}

export function DealContextSidebar({ deals, onClose }: DealContextSidebarProps) {
  if (deals.length === 0) {
    return (
      <div className="w-[260px] shrink-0 border-l border-white/[0.06] bg-white/[0.01] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
          <span className="text-xs font-medium text-muted-foreground">Deal Context</span>
          <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/[0.06]">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground/50 text-center">No linked deals.<br />Create one from the pipeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[260px] shrink-0 border-l border-white/[0.06] bg-white/[0.01] flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-medium text-muted-foreground">
          {deals.length === 1 ? "Linked Deal" : `${deals.length} Linked Deals`}
        </span>
        <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/[0.06]">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {deals.map((deal) => (
        <div key={deal.id} className="border-b border-white/[0.04] p-3 space-y-2">
          {/* Deal name + link */}
          <div className="flex items-center gap-2">
            <a
              href={`/pipeline?highlight=${deal.id}`}
              className="text-sm font-medium text-foreground hover:text-primary truncate flex-1"
            >
              {deal.deal_name}
            </a>
            <a
              href={`/pipeline?highlight=${deal.id}`}
              className="shrink-0 text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Stage + Board */}
          <div className="flex items-center gap-2">
            {deal.stage && (
              <span
                className="text-[10px] flex items-center gap-1 font-medium"
                style={{ color: deal.stage.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                {deal.stage.name}
              </span>
            )}
            <span className={cn(
              "text-[10px] font-medium",
              deal.board_type === "BD" ? "text-blue-400" :
              deal.board_type === "Marketing" ? "text-purple-400" : "text-orange-400"
            )}>
              {deal.board_type}
            </span>
          </div>

          {/* Health score */}
          {deal.health_score != null && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Health</span>
              <span className={cn(
                "text-xs font-bold",
                deal.health_score >= 70 ? "text-green-400" :
                deal.health_score >= 40 ? "text-amber-400" : "text-red-400"
              )}>
                {deal.health_score}%
              </span>
            </div>
          )}

          {/* Value + Probability */}
          <div className="flex items-center gap-3">
            {deal.value != null && deal.value > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ${Number(deal.value).toLocaleString()}
              </span>
            )}
            {deal.probability != null && deal.probability > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {deal.probability}% prob
              </span>
            )}
          </div>

          {/* Sentiment momentum */}
          {deal.ai_sentiment?.momentum && (
            <div className="flex items-center gap-1.5">
              {deal.ai_sentiment.momentum === "accelerating" ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : deal.ai_sentiment.momentum === "declining" || deal.ai_sentiment.momentum === "stalling" ? (
                <TrendingDown className="h-3 w-3 text-red-400" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground/50" />
              )}
              <span className="text-[10px] text-muted-foreground capitalize">
                {deal.ai_sentiment.momentum}
              </span>
            </div>
          )}

          {/* Awaiting response */}
          {deal.awaiting_response_since && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400">
              <Clock className="h-2.5 w-2.5" />
              Awaiting reply {timeAgo(deal.awaiting_response_since)}
            </div>
          )}

          {/* AI Summary */}
          {deal.ai_summary && (
            <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-2">
              <p className="text-[10px] text-purple-400 font-medium mb-0.5">AI Summary</p>
              <p className="text-[10px] text-foreground/70 leading-relaxed line-clamp-3">
                {deal.ai_summary}
              </p>
            </div>
          )}

          {/* Contact */}
          {deal.contact && (
            <div className="text-[10px] text-muted-foreground">
              Contact: <span className="text-foreground/70">{deal.contact.name}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
