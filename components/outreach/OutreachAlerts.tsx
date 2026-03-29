"use client";

import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutreachAlert } from "./types";

interface OutreachAlertsProps {
  alerts: OutreachAlert[];
  onDismiss: (id: string) => void;
}

export function OutreachAlerts({ alerts, onDismiss }: OutreachAlertsProps) {
  if (alerts.length === 0) return null;

  const alertColors: Record<string, { border: string; bg: string; icon: string }> = {
    low_reply_rate: { border: "border-red-500/30", bg: "bg-red-500/5", icon: "text-red-400" },
    high_drop_off: { border: "border-amber-500/30", bg: "bg-amber-500/5", icon: "text-amber-400" },
    stale_sequence: { border: "border-slate-500/30", bg: "bg-slate-500/5", icon: "text-slate-400" },
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const c = alertColors[alert.alert_type] ?? alertColors.stale_sequence;
        return (
          <div key={alert.id} className={cn("flex items-start gap-3 rounded-xl border p-3", c.border, c.bg)}>
            <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", c.icon)} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground">{alert.message}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Sequence: {alert.sequence_name}</p>
            </div>
            <button
              onClick={() => onDismiss(alert.id)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
