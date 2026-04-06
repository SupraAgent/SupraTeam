"use client";

import * as React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyticsData } from "./types";
import { AbResultCard } from "./AbResultCard";

interface BroadcastAnalyticsProps {
  analytics: AnalyticsData | null;
  loading: boolean;
}

export function BroadcastAnalytics({ analytics, loading }: BroadcastAnalyticsProps) {
  if (loading || !analytics) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white/[0.02] animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Broadcasts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{analytics.overview.totalBroadcasts}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivery Rate</p>
          <p className={cn("text-2xl font-bold mt-1", analytics.overview.deliveryRate >= 90 ? "text-emerald-400" : analytics.overview.deliveryRate >= 70 ? "text-amber-400" : "text-red-400")}>
            {analytics.overview.deliveryRate}%
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Messages Sent</p>
          <p className="text-2xl font-bold text-foreground mt-1">{analytics.overview.totalSent}</p>
          {analytics.overview.totalFailed > 0 && (
            <p className="text-[10px] text-red-400 mt-0.5">{analytics.overview.totalFailed} failed</p>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">This Week</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold text-foreground">{analytics.overview.thisWeek}</p>
            {analytics.overview.weeklyChange !== 0 && (
              <span className={cn("flex items-center gap-0.5 text-xs", analytics.overview.weeklyChange >= 0 ? "text-emerald-400" : "text-red-400")}>
                {analytics.overview.weeklyChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {analytics.overview.weeklyChange >= 0 ? "+" : ""}{analytics.overview.weeklyChange}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Slug performance */}
      {analytics.slugStats.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Performance by Tag</h3>
          <div className="space-y-2">
            {analytics.slugStats.map((s) => (
              <div key={s.slug} className="flex items-center gap-3">
                <span className="text-xs text-foreground font-medium w-28 truncate">{s.slug}</span>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", s.deliveryRate >= 90 ? "bg-emerald-400" : s.deliveryRate >= 70 ? "bg-amber-400" : "bg-red-400")}
                    style={{ width: `${s.deliveryRate}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-20 text-right">
                  {s.sent}/{s.sent + s.failed} ({s.deliveryRate}%)
                </span>
                <span className="text-[10px] text-muted-foreground w-16 text-right">
                  {s.count} sends
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sender breakdown */}
      {analytics.senderStats.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">By Sender</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {analytics.senderStats.map((s) => (
              <span key={s.name} className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs">
                <span className="text-foreground font-medium">{s.name}</span>
                <span className="text-muted-foreground ml-1.5">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Daily volume chart */}
      {analytics.dailyVolume.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Daily Volume (30d)</h3>
          <div className="flex items-end gap-0.5 h-16">
            {analytics.dailyVolume.map((d) => {
              const max = Math.max(...analytics.dailyVolume.map((v) => v.count));
              const height = max > 0 ? (d.count / max) * 100 : 0;
              return (
                <div
                  key={d.date}
                  className="flex-1 bg-primary/40 rounded-t hover:bg-primary/60 transition-colors"
                  style={{ height: `${Math.max(height, 4)}%` }}
                  title={`${d.date}: ${d.count} broadcasts`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>{analytics.dailyVolume[0]?.date}</span>
            <span>{analytics.dailyVolume[analytics.dailyVolume.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* A/B test results */}
      {analytics.abResults && analytics.abResults.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">A/B Test Results</h3>
          {analytics.abResults.map((ab) => (
            <AbResultCard key={ab.broadcast_id} result={ab} />
          ))}
        </div>
      )}

      {/* Engagement heatmap — best send times */}
      {analytics.bestSendTime && analytics.bestSendTime.length > 0 && (() => {
        const hours = Array.from({ length: 24 }, (_, i) => i);
        const hourMap = new Map(analytics.bestSendTime!.map((h) => [h.hour, h]));
        const maxRate = Math.max(...analytics.bestSendTime!.map((h) => h.responseRate), 1);
        const bestHour = analytics.bestSendTime!.reduce((best, h) => h.responseRate > best.responseRate ? h : best, analytics.bestSendTime![0]);

        return (
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Best Send Times</h3>
              {bestHour && (
                <span className="text-[10px] text-emerald-400">
                  Peak: {bestHour.hour.toString().padStart(2, "0")}:00 UTC ({bestHour.responseRate}% response rate)
                </span>
              )}
            </div>
            <div className="grid grid-cols-12 gap-1">
              {hours.map((hour) => {
                const data = hourMap.get(hour);
                const rate = data?.responseRate ?? 0;
                const intensity = maxRate > 0 ? rate / maxRate : 0;
                const bg = rate === 0 ? "bg-white/5"
                  : intensity >= 0.75 ? "bg-emerald-500/60"
                  : intensity >= 0.5 ? "bg-emerald-500/40"
                  : intensity >= 0.25 ? "bg-emerald-500/20"
                  : "bg-emerald-500/10";
                return (
                  <div
                    key={hour}
                    className={cn("rounded aspect-square flex flex-col items-center justify-center transition-colors hover:ring-1 hover:ring-white/20", bg)}
                    title={`${hour.toString().padStart(2, "0")}:00 UTC — ${data?.sent ?? 0} sent, ${data?.responded ?? 0} responses (${rate}%)`}
                  >
                    <span className="text-[8px] text-muted-foreground leading-none">{hour.toString().padStart(2, "0")}</span>
                    {data && data.sent > 0 && (
                      <span className="text-[8px] font-medium text-foreground leading-none mt-0.5">{rate}%</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[9px] text-muted-foreground">Response rate:</span>
              {["bg-white/5", "bg-emerald-500/10", "bg-emerald-500/20", "bg-emerald-500/40", "bg-emerald-500/60"].map((bg, i) => (
                <div key={i} className={cn("h-2.5 w-5 rounded", bg)} />
              ))}
              <span className="text-[9px] text-muted-foreground">high</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
