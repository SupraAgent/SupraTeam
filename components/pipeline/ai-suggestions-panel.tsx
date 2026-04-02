"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkles, MessageCircle, AlertTriangle, XCircle, ArrowRight, Loader2 } from "lucide-react";

interface Suggestion {
  deal_id: string;
  deal_name: string;
  contact_name: string | null;
  board_type: string;
  value: number | null;
  stage_name: string | null;
  action: "follow_up" | "escalate" | "close";
  reason: string;
  urgency: "high" | "medium" | "low";
}

interface AISuggestionsPanelProps {
  onDealClick: (dealId: string) => void;
  onQuickOutcome?: (dealId: string, outcome: string) => void;
}

const ACTION_CONFIG = {
  follow_up: { label: "Follow Up", icon: MessageCircle, color: "text-blue-400", bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20" },
  escalate: { label: "Escalate", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20" },
  close: { label: "Close", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 hover:bg-red-500/20 border-red-500/20" },
} as const;

export function AISuggestionsPanel({ onDealClick, onQuickOutcome }: AISuggestionsPanelProps) {
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [confirmingClose, setConfirmingClose] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/deals/suggestions")
      .then((r) => r.ok ? r.json() : { suggestions: [] })
      .then((d) => setSuggestions(d.suggestions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = suggestions.filter((s) => !dismissed.has(s.deal_id));

  if (loading) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        Finding deals that need attention...
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">{visible.length} deal{visible.length !== 1 ? "s" : ""} need attention</span>
        <span className="text-[10px] text-muted-foreground/50">Pick one</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {visible.map((s, i) => {
          const config = ACTION_CONFIG[s.action];
          const Icon = config.icon;
          return (
            <div
              key={s.deal_id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2 animate-slide-up"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.deal_name}</p>
                  {s.contact_name && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{s.contact_name}</p>
                  )}
                </div>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0",
                  s.urgency === "high" ? "bg-red-500/20 text-red-400" :
                  s.urgency === "medium" ? "bg-amber-500/20 text-amber-400" :
                  "bg-white/10 text-muted-foreground"
                )}>
                  {s.urgency}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {s.stage_name && <span>{s.stage_name}</span>}
                {s.value != null && s.value > 0 && (
                  <span className="text-foreground/60">${Number(s.value).toLocaleString()}</span>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground/70">{s.reason}</p>

              <div className="flex items-center gap-2 pt-1">
                {s.action === "close" && confirmingClose === s.deal_id ? (
                  <>
                    <span className="text-[10px] text-red-400">Mark as lost?</span>
                    <button
                      onClick={() => {
                        onQuickOutcome?.(s.deal_id, "lost");
                        setDismissed((prev) => new Set(prev).add(s.deal_id));
                        setConfirmingClose(null);
                      }}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmingClose(null)}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      if (s.action === "close") {
                        setConfirmingClose(s.deal_id);
                      } else {
                        onDealClick(s.deal_id);
                        setDismissed((prev) => new Set(prev).add(s.deal_id));
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors",
                      config.bg, config.color
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </button>
                )}
                <button
                  onClick={() => onDealClick(s.deal_id)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  View <ArrowRight className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
