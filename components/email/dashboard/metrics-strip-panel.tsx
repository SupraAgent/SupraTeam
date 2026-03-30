"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Send, Eye, MousePointerClick, Target, Clock, TrendingUp } from "lucide-react";

interface MetricsData {
  sent7d: number;
  pending: number;
  opens7d: number;
  clicks7d: number;
  openRate: number;
  clickRate: number;
  dealsTouched7d: number;
  daily: { date: string; opens: number; clicks: number }[];
}

export function MetricsStripPanel() {
  const [data, setData] = React.useState<MetricsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/plugins/email-metrics")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((json) => setData(json.data ?? null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex-1 rounded-lg bg-white/5 animate-pulse h-16" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-red-400/80">Failed to load metrics</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No email metrics available</p>
      </div>
    );
  }

  const metrics = [
    { label: "Sent (7d)", value: data.sent7d, icon: Send, color: "text-blue-400" },
    { label: "Opens (7d)", value: data.opens7d, icon: Eye, color: "text-green-400" },
    { label: "Clicks (7d)", value: data.clicks7d, icon: MousePointerClick, color: "text-purple-400" },
    { label: "Open Rate", value: `${data.openRate}%`, icon: TrendingUp, color: "text-primary" },
    { label: "Click Rate", value: `${data.clickRate}%`, icon: Target, color: "text-yellow-400" },
    { label: "Deals Touched", value: data.dealsTouched7d, icon: Target, color: "text-pink-400" },
    { label: "Pending", value: data.pending, icon: Clock, color: "text-orange-400" },
  ];

  return (
    <div className="space-y-3">
      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-center"
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon className={cn("h-3 w-3", metric.color)} />
                <span className="text-sm font-semibold text-foreground">{metric.value}</span>
              </div>
              <span className="text-[9px] text-muted-foreground">{metric.label}</span>
            </div>
          );
        })}
      </div>

      {/* Sparkline (simple bar chart) */}
      {data.daily.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            7-Day Trend
          </h4>
          <div className="flex items-end gap-1 h-12">
            {data.daily.map((day) => {
              const maxVal = Math.max(...data.daily.map((d) => d.opens + d.clicks), 1);
              const total = day.opens + day.clicks;
              const height = (total / maxVal) * 100;
              const dayLabel = new Date(day.date).toLocaleDateString([], { weekday: "short" });

              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex flex-col items-center" style={{ height: "48px" }}>
                    <div className="w-full mt-auto flex flex-col">
                      {day.clicks > 0 && (
                        <div
                          className="w-full rounded-t bg-purple-500/60"
                          style={{ height: `${(day.clicks / maxVal) * 48}px` }}
                        />
                      )}
                      <div
                        className={cn(
                          "w-full bg-primary/40",
                          day.clicks > 0 ? "" : "rounded-t"
                        )}
                        style={{ height: `${Math.max((day.opens / maxVal) * 48, total > 0 ? 2 : 0)}px` }}
                      />
                    </div>
                  </div>
                  <span className="text-[8px] text-muted-foreground/60">{dayLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded bg-primary/40" />
              <span className="text-[8px] text-muted-foreground">Opens</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded bg-purple-500/60" />
              <span className="text-[8px] text-muted-foreground">Clicks</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
