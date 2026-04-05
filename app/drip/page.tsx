"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Droplets,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Send,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import type {
  Sequence,
  SequenceAnalytics,
  OutreachAlert,
} from "@/components/outreach/types";

interface SequenceWithSteps extends Sequence {
  steps?: Array<{ step_number: number; delay_hours: number }>;
}

interface TimelineEntry {
  sequenceName: string;
  sequenceId: string;
  stepNumber: number;
  activeAtStep: number;
  estimatedSendTime: "next_24h" | "next_48h";
  delayHours: number;
}

export default function DripDashboardPage() {
  const [sequences, setSequences] = React.useState<SequenceWithSteps[]>([]);
  const [analytics, setAnalytics] = React.useState<SequenceAnalytics[]>([]);
  const [alerts, setAlerts] = React.useState<OutreachAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const activeSequences = React.useMemo(
    () => sequences.filter((s) => s.status === "active"),
    [sequences]
  );

  const totals = React.useMemo(() => {
    return activeSequences.reduce(
      (acc, s) => {
        acc.total += s.enrollment_stats.total;
        acc.active += s.enrollment_stats.active;
        acc.completed += s.enrollment_stats.completed;
        acc.replied += s.enrollment_stats.replied;
        return acc;
      },
      { total: 0, active: 0, completed: 0, replied: 0 }
    );
  }, [activeSequences]);

  const replyRate =
    totals.total > 0 ? Math.round((totals.replied / totals.total) * 100) : 0;
  const completionRate =
    totals.total > 0
      ? Math.round((totals.completed / totals.total) * 100)
      : 0;

  // Build a timeline of upcoming sends based on active enrollments per step
  const timeline = React.useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    for (const seq of activeSequences) {
      if (seq.step_count <= 0 || seq.enrollment_stats.active === 0) continue;
      // Estimate: contacts are roughly evenly distributed across steps
      const perStep = Math.max(
        1,
        Math.ceil(seq.enrollment_stats.active / seq.step_count)
      );
      for (let step = 1; step <= seq.step_count; step++) {
        // Rough delay estimation: first step sends soon, later steps further out
        const estimatedHours = step * 24; // simplified assumption
        if (estimatedHours <= 48) {
          entries.push({
            sequenceName: seq.name,
            sequenceId: seq.id,
            stepNumber: step,
            activeAtStep: perStep,
            estimatedSendTime: estimatedHours <= 24 ? "next_24h" : "next_48h",
            delayHours: estimatedHours,
          });
        }
      }
    }
    return entries.sort((a, b) => a.delayHours - b.delayHours);
  }, [activeSequences]);

  const timeline24h = timeline.filter((t) => t.estimatedSendTime === "next_24h");
  const timeline48h = timeline.filter((t) => t.estimatedSendTime === "next_48h");

  // Identify sequences needing attention from analytics
  const needsAttention = React.useMemo(() => {
    return analytics.filter(
      (a) =>
        a.status === "active" &&
        (a.reply_rate < 5 || (a.total > 10 && a.completion_rate < 10))
    );
  }, [analytics]);

  async function fetchAll() {
    try {
      const [seqRes, analyticsRes, alertsRes] = await Promise.all([
        fetch("/api/outreach/sequences"),
        fetch("/api/outreach/analytics"),
        fetch("/api/outreach/alerts"),
      ]);

      if (seqRes.ok) {
        const data = await seqRes.json();
        setSequences(data.sequences ?? []);
      }
      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data.sequences ?? []);
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.alerts ?? []);
      }
    } catch {
      toast.error("Failed to load drip data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function dismissAlert(id: string) {
    try {
      const res = await fetch("/api/outreach/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      } else {
        toast.error("Failed to dismiss alert");
      }
    } catch {
      toast.error("Network error dismissing alert");
    }
  }

  React.useEffect(() => {
    fetchAll();
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchAll();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
            <Droplets className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Drip Campaign Monitor
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time status of active outreach sequences
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-xl border p-3",
                alert.alert_type === "high_bounce"
                  ? "border-red-500/20 bg-red-500/5"
                  : alert.alert_type === "low_engagement"
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-white/10 bg-white/[0.02]"
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    alert.alert_type === "high_bounce"
                      ? "text-red-400"
                      : "text-amber-400"
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {alert.sequence_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {alert.message}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                    {timeAgo(alert.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Active Sequences",
            value: activeSequences.length,
            icon: Play,
            color: "text-emerald-400",
            sub: `${sequences.length} total`,
          },
          {
            label: "Contacts In-Flight",
            value: totals.active,
            icon: Users,
            color: "text-blue-400",
            sub: `${totals.total} enrolled total`,
          },
          {
            label: "Reply Rate",
            value: `${replyRate}%`,
            icon: MessageSquare,
            color: replyRate >= 20 ? "text-emerald-400" : replyRate >= 10 ? "text-amber-400" : "text-red-400",
            sub: `${totals.replied} replies received`,
          },
          {
            label: "Completion Rate",
            value: `${completionRate}%`,
            icon: CheckCircle2,
            color: "text-muted-foreground",
            sub: `${totals.completed} completed`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {card.label}
              </p>
              <card.icon className={cn("h-3.5 w-3.5", card.color)} />
            </div>
            <p className={cn("text-xl font-semibold mt-1", card.color)}>
              {card.value}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {card.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Main content: two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Active Sequence Status */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Active Sequences
            </h2>
          </div>
          {activeSequences.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No active sequences running.
            </p>
          ) : (
            <div className="space-y-2">
              {activeSequences.map((seq) => {
                const matchingAnalytics = analytics.find(
                  (a) => a.id === seq.id
                );
                const seqReplyRate = matchingAnalytics?.reply_rate ?? 0;
                const progressPct =
                  seq.enrollment_stats.total > 0
                    ? Math.round(
                        ((seq.enrollment_stats.completed +
                          seq.enrollment_stats.replied) /
                          seq.enrollment_stats.total) *
                          100
                      )
                    : 0;

                return (
                  <div
                    key={seq.id}
                    className="rounded-lg border border-white/5 bg-white/[0.01] p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                          {seq.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {seq.step_count} steps
                      </span>
                    </div>

                    {/* Step distribution bar */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">
                        {progressPct}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {seq.enrollment_stats.active} active
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {seqReplyRate}% reply
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {seq.enrollment_stats.completed} done
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Upcoming Send Timeline */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Upcoming Sends
            </h2>
          </div>

          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No upcoming sends scheduled.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Next 24h */}
              {timeline24h.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-400/80 mb-1.5">
                    Next 24 hours
                  </p>
                  <div className="space-y-1.5">
                    {timeline24h.map((entry, i) => (
                      <div
                        key={`24h-${i}`}
                        className="flex items-center justify-between rounded-lg border border-amber-500/10 bg-amber-500/5 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Send className="h-3 w-3 text-amber-400" />
                          <span className="text-xs text-foreground truncate max-w-[160px]">
                            {entry.sequenceName}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                          <span className="text-[10px] text-muted-foreground">
                            Step {entry.stepNumber}
                          </span>
                        </div>
                        <span className="text-[10px] text-amber-400 font-medium">
                          ~{entry.activeAtStep} contacts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next 48h */}
              {timeline48h.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">
                    24-48 hours
                  </p>
                  <div className="space-y-1.5">
                    {timeline48h.map((entry, i) => (
                      <div
                        key={`48h-${i}`}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Send className="h-3 w-3 text-muted-foreground/60" />
                          <span className="text-xs text-foreground truncate max-w-[160px]">
                            {entry.sequenceName}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                          <span className="text-[10px] text-muted-foreground">
                            Step {entry.stepNumber}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          ~{entry.activeAtStep} contacts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Engagement Metrics Table */}
      {analytics.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Sequence Performance
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 text-muted-foreground font-medium">
                    Sequence
                  </th>
                  <th className="text-center py-2 text-muted-foreground font-medium">
                    Status
                  </th>
                  <th className="text-right py-2 text-muted-foreground font-medium">
                    Enrolled
                  </th>
                  <th className="text-right py-2 text-muted-foreground font-medium">
                    Active
                  </th>
                  <th className="text-right py-2 text-muted-foreground font-medium">
                    Reply %
                  </th>
                  <th className="text-right py-2 text-muted-foreground font-medium">
                    Complete %
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((seq) => (
                  <tr
                    key={seq.id}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-2 text-foreground font-medium max-w-[200px] truncate">
                      {seq.name}
                    </td>
                    <td className="py-2 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          seq.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : seq.status === "paused"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-white/5 text-muted-foreground"
                        )}
                      >
                        {seq.status === "active" ? (
                          <Play className="h-2.5 w-2.5" />
                        ) : seq.status === "paused" ? (
                          <Pause className="h-2.5 w-2.5" />
                        ) : null}
                        {seq.status}
                      </span>
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {seq.total}
                    </td>
                    <td className="py-2 text-right text-blue-400">
                      {seq.active}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right font-medium",
                        seq.reply_rate >= 20
                          ? "text-emerald-400"
                          : seq.reply_rate >= 10
                            ? "text-amber-400"
                            : seq.reply_rate > 0
                              ? "text-red-400"
                              : "text-muted-foreground"
                      )}
                    >
                      {seq.reply_rate}%
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {seq.completion_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Low-performing sequences alert */}
      {needsAttention.length > 0 && (
        <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400">
              Needs Attention
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            These active sequences have low engagement and may need message
            adjustments or pausing.
          </p>
          <div className="space-y-1.5">
            {needsAttention.map((seq) => (
              <div
                key={seq.id}
                className="flex items-center justify-between rounded-lg border border-red-500/10 bg-red-500/[0.03] px-3 py-2"
              >
                <span className="text-xs text-foreground">{seq.name}</span>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-red-400">
                    {seq.reply_rate}% reply rate
                  </span>
                  <span className="text-muted-foreground">
                    {seq.total} enrolled
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sequences.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <Droplets className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No outreach sequences yet.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create sequences in{" "}
            <a href="/outreach" className="text-blue-400 hover:underline">
              Outreach
            </a>{" "}
            to see them monitored here.
          </p>
        </div>
      )}
    </div>
  );
}
