"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Activity,
  CheckCircle2,
  XCircle,
  Timer,
  AlertTriangle,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "24h" | "7d" | "30d";

interface AnalyticsData {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  failedRuns: number;
  runsByStatus: Record<string, number>;
  topErrors: { error: string; count: number }[];
  runsByWorkflow: {
    id: string;
    name: string;
    runs: number;
    successRate: number;
    avgDurationMs: number;
  }[];
  hourlyRuns: { hour: string; count: number; failed: number }[];
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
}

// ── Skeleton ─────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 animate-pulse">
      <div className="h-3 w-20 bg-white/10 rounded mb-3" />
      <div className="h-7 w-16 bg-white/10 rounded" />
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-white/[0.03] rounded animate-pulse" />
      ))}
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  suffix,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">
        {value}
        {suffix && <span className="text-sm text-muted-foreground ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Hourly Bar Chart ─────────────────────────────────────────

function HourlyChart({ data }: { data: AnalyticsData["hourlyRuns"] }) {
  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  // Show at most 48 bars
  const trimmed = data.length > 48 ? data.slice(-48) : data;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-blue-400" />
        <h3 className="text-sm font-semibold">Run Activity</h3>
      </div>
      <div className="flex items-end gap-[2px] h-32">
        {trimmed.map((d, i) => {
          const height = Math.max((d.count / maxCount) * 100, 2);
          const failedHeight =
            d.failed > 0 ? Math.max((d.failed / maxCount) * 100, 2) : 0;
          const successHeight = height - failedHeight;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end group relative min-w-[3px]"
              style={{ height: "100%" }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-black/90 border border-white/20 rounded px-2 py-1 text-[10px] whitespace-nowrap">
                  <div className="font-medium">{formatHour(d.hour)}</div>
                  <div>{d.count} runs{d.failed > 0 ? ` (${d.failed} failed)` : ""}</div>
                </div>
              </div>
              {/* Bars */}
              {failedHeight > 0 && (
                <div
                  className="w-full bg-red-500/70 rounded-t-[1px]"
                  style={{ height: `${failedHeight}%` }}
                />
              )}
              <div
                className="w-full bg-emerald-500/70 rounded-t-[1px]"
                style={{ height: `${successHeight}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
        {trimmed.length > 0 && <span>{formatHour(trimmed[0].hour)}</span>}
        {trimmed.length > 1 && <span>{formatHour(trimmed[trimmed.length - 1].hour)}</span>}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/70" /> Success
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-red-500/70" /> Failed
        </span>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function WorkflowAnalyticsPage() {
  const [period, setPeriod] = React.useState<Period>("7d");
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/loop/analytics?period=${period}`);
      if (!res.ok) {
        setError(`Failed to load analytics (${res.status})`);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("Network error — could not load analytics");
    }
    setLoading(false);
  }, [period]);

  React.useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/automations"
              className="rounded-lg p-1.5 hover:bg-white/5 transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              <h1 className="text-lg font-semibold">Workflow Analytics</h1>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition",
                  period === p.value
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Total Runs"
              value={data.totalRuns.toLocaleString()}
              icon={Activity}
              color="text-blue-400"
            />
            <StatCard
              label="Success Rate"
              value={data.successRate}
              icon={TrendingUp}
              color="text-emerald-400"
              suffix="%"
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(data.avgDurationMs)}
              icon={Timer}
              color="text-amber-400"
            />
            <StatCard
              label="Failed Runs"
              value={data.failedRuns.toLocaleString()}
              icon={XCircle}
              color="text-red-400"
            />
          </div>
        ) : null}

        {/* Hourly chart */}
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 h-48 animate-pulse" />
        ) : data && data.hourlyRuns.length > 0 ? (
          <HourlyChart data={data.hourlyRuns} />
        ) : null}

        {/* Two-column layout: leaderboard + errors */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workflow leaderboard */}
          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Workflow Leaderboard</h3>
            </div>
            {loading ? (
              <TableSkeleton />
            ) : data && data.runsByWorkflow.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-white/10">
                      <th className="pb-2 font-medium">Workflow</th>
                      <th className="pb-2 font-medium text-right">Runs</th>
                      <th className="pb-2 font-medium text-right">Success</th>
                      <th className="pb-2 font-medium text-right">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runsByWorkflow.map((wf) => (
                      <tr
                        key={wf.id}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition"
                      >
                        <td className="py-2.5 pr-4">
                          <Link
                            href={`/automations/${wf.id}`}
                            className="text-foreground hover:text-blue-400 transition font-medium"
                          >
                            {wf.name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {wf.runs.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          <span
                            className={cn(
                              wf.successRate >= 90
                                ? "text-emerald-400"
                                : wf.successRate >= 70
                                  ? "text-amber-400"
                                  : "text-red-400"
                            )}
                          >
                            {wf.successRate}%
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatDuration(wf.avgDurationMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No workflow runs in this period" />
            )}
          </div>

          {/* Top errors */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold">Top Errors</h3>
            </div>
            {loading ? (
              <TableSkeleton rows={4} />
            ) : data && data.topErrors.length > 0 ? (
              <div className="space-y-2">
                {data.topErrors.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-2 py-2 border-b border-white/5 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground break-all line-clamp-2">
                      {e.error}
                    </span>
                    <span className="text-xs font-mono text-red-400 shrink-0">
                      {e.count}x
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No errors in this period" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Loader2 className="h-6 w-6 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
