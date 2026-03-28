"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { GraphNode, DealParticipantRole } from "@/lib/types";

interface DealInfluencePanelProps {
  deal: { id: string; name: string; stage: { name: string; color: string } | null; value: number | null } | null;
  participants: GraphNode[];
  timeline: { date: string; event_type: string; description: string; contact_id?: string }[];
  onAddParticipant?: () => void;
  onChangeRole?: (contactId: string, role: DealParticipantRole) => void;
  className?: string;
}

const ROLE_COLORS: Record<string, string> = {
  primary: "#34d399",
  champion: "#60a5fa",
  influencer: "#a78bfa",
  blocker: "#f87171",
  decision_maker: "#fbbf24",
  involved: "#94a3b8",
};

const ROLE_LABELS: Record<string, string> = {
  primary: "Primary",
  champion: "Champion",
  influencer: "Influencer",
  blocker: "Blocker",
  decision_maker: "Decision Maker",
  involved: "Involved",
};

const EVENT_COLORS: Record<string, string> = {
  stage_change: "#34d399",
  highlight: "#fbbf24",
  outreach_step: "#a78bfa",
  message: "#60a5fa",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function DealInfluencePanel({
  deal,
  participants,
  timeline,
  onAddParticipant,
  onChangeRole,
  className,
}: DealInfluencePanelProps) {
  if (!deal) {
    return (
      <div className={cn("p-3 text-xs text-muted-foreground/50", className)}>
        Select a deal to view its influence network
      </div>
    );
  }

  const sortedParticipants = [...participants].sort(
    (a, b) => ((b.meta.influence_score as number) ?? 0) - ((a.meta.influence_score as number) ?? 0)
  );

  return (
    <div className={cn("space-y-4 overflow-y-auto", className)}>
      {/* Deal summary */}
      <div>
        <h3 className="text-sm font-medium text-foreground truncate">{deal.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          {deal.stage && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ backgroundColor: `${deal.stage.color}20`, color: deal.stage.color }}
            >
              {deal.stage.name}
            </span>
          )}
          {deal.value != null && (
            <span className="text-[10px] text-muted-foreground">
              ${deal.value.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Participants */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Participants ({sortedParticipants.length})
          </h4>
          {onAddParticipant && (
            <button
              onClick={onAddParticipant}
              className="text-[10px] text-primary hover:text-primary/80 transition"
            >
              + Add
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {sortedParticipants.map((p) => {
            const role = (p.meta.role as string) ?? "involved";
            const score = (p.meta.influence_score as number) ?? 0;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-foreground truncate">{p.label}</span>
                    {onChangeRole ? (
                      <select
                        value={role}
                        onChange={(e) => onChangeRole(p.id, e.target.value as DealParticipantRole)}
                        className="text-[9px] px-1 py-0.5 rounded border-none bg-transparent focus:outline-none"
                        style={{ color: ROLE_COLORS[role] }}
                      >
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="text-[9px] px-1 py-0.5 rounded-md"
                        style={{ backgroundColor: `${ROLE_COLORS[role]}20`, color: ROLE_COLORS[role] }}
                      >
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    )}
                  </div>
                  {/* Influence bar */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, score)}%`,
                          backgroundColor: ROLE_COLORS[role],
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/50 w-5 text-right">{score}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2">
            Timeline
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {timeline.slice(0, 20).map((event, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: EVENT_COLORS[event.event_type] ?? "#94a3b8" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-foreground truncate">{event.description}</p>
                  <p className="text-[9px] text-muted-foreground/40">{timeAgo(event.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
