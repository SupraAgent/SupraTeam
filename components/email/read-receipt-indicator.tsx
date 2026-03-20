"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TrackingEvent = {
  id: string;
  tracking_id: string;
  event_type: string;
  opened_at: string;
};

type ReadReceiptIndicatorProps = {
  trackingId: string;
  className?: string;
};

export function ReadReceiptIndicator({ trackingId, className }: ReadReceiptIndicatorProps) {
  const [events, setEvents] = React.useState<TrackingEvent[]>([]);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!trackingId) return;
    fetch(`/api/email/track?tracking_id=${trackingId}`)
      .then((r) => r.json())
      .then((json) => setEvents(json.data ?? []))
      .catch(() => {});
  }, [trackingId]);

  if (events.length === 0) return null;

  const uniqueOpens = events.filter((e) => e.event_type === "open");
  const firstOpen = uniqueOpens[uniqueOpens.length - 1];
  const lastOpen = uniqueOpens[0];

  return (
    <div className={cn("inline-flex items-center", className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 transition"
        title={`Opened ${uniqueOpens.length} time${uniqueOpens.length !== 1 ? "s" : ""}`}
      >
        <EyeIcon className="h-3 w-3" />
        <span>{uniqueOpens.length}x opened</span>
      </button>

      {expanded && (
        <div className="absolute top-full left-0 mt-1 z-10 w-48 rounded-lg border border-white/10 shadow-xl p-2 space-y-1 animate-dropdown-in"
          style={{ backgroundColor: "hsl(var(--surface-4))" }}
        >
          <p className="text-[10px] text-muted-foreground px-1">
            First: {new Date(firstOpen.opened_at).toLocaleString()}
          </p>
          {uniqueOpens.length > 1 && (
            <p className="text-[10px] text-muted-foreground px-1">
              Last: {new Date(lastOpen.opened_at).toLocaleString()}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/50 px-1">
            {uniqueOpens.length} total open{uniqueOpens.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
