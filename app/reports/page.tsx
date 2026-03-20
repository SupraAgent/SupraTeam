"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DateRange = "7d" | "30d" | "90d" | "this_month" | "last_month" | "this_quarter" | "all";

function getDateRange(range: DateRange): { from: string; to: string; compareFrom?: string; compareTo?: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  let compareFrom: Date | undefined;
  let compareTo: Date | undefined;

  switch (range) {
    case "7d":
      from = new Date(now.getTime() - 7 * 86400000);
      compareFrom = new Date(from.getTime() - 7 * 86400000);
      compareTo = new Date(from.getTime());
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * 86400000);
      compareFrom = new Date(from.getTime() - 30 * 86400000);
      compareTo = new Date(from.getTime());
      break;
    case "90d":
      from = new Date(now.getTime() - 90 * 86400000);
      compareFrom = new Date(from.getTime() - 90 * 86400000);
      compareTo = new Date(from.getTime());
      break;
    case "this_month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      compareFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      compareTo = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case "last_month":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      compareFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      compareTo = new Date(now.getFullYear(), now.getMonth() - 1, 0);
      return {
        from: from.toISOString(),
        to: endOfLastMonth.toISOString(),
        compareFrom: compareFrom.toISOString(),
        compareTo: compareTo.toISOString(),
      };
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case "all":
      from = new Date("2020-01-01");
      break;
  }

  return {
    from: from.toISOString(),
    to,
    compareFrom: compareFrom?.toISOString(),
    compareTo: compareTo?.toISOString(),
  };
}

type ReportData = {
  totalDeals: number;
  wonCount: number;
  lostCount: number;
  openCount: number;
  winRate: number | null;
  wonRevenue: number;
  lostRevenue: number;
  pipelineValue: number;
  weightedPipeline: number;
  avgDaysToClose: number | null;
  boardMetrics: Record<string, { deals: number; won: number; lost: number; revenue: number; pipeline: number }>;
  funnel: { name: string; count: number; color: string | null; position: number }[];
  stageConversions: { from: string; to: string; rate: number | null; volume: number; color: string | null }[];
  dealAging: { name: string; color: string | null; count: number; avg_days: number }[];
  healthDistribution: { critical: number; warning: number; healthy: number; excellent: number };
  lostReasons: { reason: string; count: number }[];
  teamLeaderboard: { name: string; deals: number; won: number; revenue: number }[];
  createdByDay: Record<string, number>;
  wonByDay: Record<string, number>;
  lostByDay: Record<string, number>;
  comparison: { totalDeals: number; wonCount: number; lostCount: number; winRate: number | null; wonRevenue: number } | null;
};

const RANGES: { value: DateRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "all", label: "All time" },
];

function StatCard({ label, value, comparison, suffix, prefix }: {
  label: string; value: number | string | null; comparison?: number | null; suffix?: string; prefix?: string;
}) {
  const delta = typeof comparison === "number" && typeof value === "number"
    ? value - comparison : null;
  const compNum = typeof comparison === "number" ? comparison : null;
  const pctChange = delta !== null && compNum !== null && compNum !== 0
    ? Math.round((delta / compNum) * 100) : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">
        {prefix}{value != null ? (typeof value === "number" ? value.toLocaleString() : value) : "—"}{suffix}
      </p>
      {pctChange !== null && (
        <p className={cn("text-xs mt-1", pctChange >= 0 ? "text-emerald-400" : "text-red-400")}>
          {pctChange >= 0 ? "+" : ""}{pctChange}% vs previous
        </p>
      )}
    </div>
  );
}

function BarChart({ data, maxVal }: { data: { label: string; value: number; color?: string }[]; maxVal?: number }) {
  const max = maxVal ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-28 truncate text-right">{d.label}</span>
          <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max((d.value / max) * 100, 1)}%`,
                backgroundColor: d.color ?? "hsl(var(--primary))",
              }}
            />
          </div>
          <span className="text-xs font-medium text-foreground w-12 text-right">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function HorizontalBar({ segments, labels }: {
  segments: { value: number; color: string; label: string }[];
  labels?: boolean;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No data</p>;
  return (
    <div>
      <div className="flex h-6 rounded-full overflow-hidden bg-white/5">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="h-full transition-all duration-500 flex items-center justify-center text-[10px] font-medium text-white"
            style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.value}`}
          >
            {seg.value > 0 && (seg.value / total) > 0.08 && seg.value}
          </div>
        ))}
      </div>
      {labels && (
        <div className="flex gap-3 mt-2 flex-wrap">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="text-[11px] text-muted-foreground">{seg.label} ({seg.value})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniTrend({ data, color }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const h = 40;
  const w = 120;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} className="mt-1">
      <polyline
        points={points}
        fill="none"
        stroke={color ?? "hsl(var(--primary))"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ReportsPage() {
  const [range, setRange] = React.useState<DateRange>("30d");
  const [data, setData] = React.useState<ReportData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    const { from, to, compareFrom, compareTo } = getDateRange(range);
    const params = new URLSearchParams({ from, to });
    if (compareFrom) params.set("compareFrom", compareFrom);
    if (compareTo) params.set("compareTo", compareTo);

    fetch(`/api/reports?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [range]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Trend data from daily buckets
  const days = Object.keys(data.createdByDay).sort();
  const createdTrend = days.map((d) => data.createdByDay[d] ?? 0);
  const wonTrend = days.map((d) => data.wonByDay[d] ?? 0);

  const funnelMax = Math.max(...data.funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
            Pipeline analytics, conversion rates, and team performance.
          </p>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                range === r.value
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Deals" value={data.totalDeals} comparison={data.comparison?.totalDeals} />
        <StatCard label="Win Rate" value={data.winRate} comparison={data.comparison?.winRate} suffix="%" />
        <StatCard label="Won Revenue" value={data.wonRevenue} comparison={data.comparison?.wonRevenue} prefix="$" />
        <StatCard label="Pipeline Value" value={data.pipelineValue} prefix="$" />
        <StatCard label="Weighted Pipeline" value={data.weightedPipeline} prefix="$" />
        <StatCard label="Avg Days to Close" value={data.avgDaysToClose} suffix=" days" />
        <StatCard label="Won" value={data.wonCount} comparison={data.comparison?.wonCount} />
        <StatCard label="Lost" value={data.lostCount} comparison={data.comparison?.lostCount} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Funnel */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Pipeline Funnel</h3>
          <div className="space-y-1.5">
            {data.funnel.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-32 truncate text-right">{f.name}</span>
                <div className="flex-1 relative">
                  <div className="h-7 bg-white/5 rounded" style={{ width: "100%" }}>
                    <div
                      className="h-full rounded flex items-center px-2 transition-all duration-500"
                      style={{
                        width: `${Math.max((f.count / funnelMax) * 100, 3)}%`,
                        backgroundColor: f.color ?? "hsl(var(--primary))",
                        opacity: 1 - i * 0.08,
                      }}
                    >
                      <span className="text-xs font-medium text-white">{f.count}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversion Rates */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Stage Conversion Rates</h3>
          <div className="space-y-2">
            {data.stageConversions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 truncate text-right">{c.from}</span>
                <svg className="h-3 w-3 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <span className="text-xs text-muted-foreground w-24 truncate">{c.to}</span>
                <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${c.rate ?? 0}%`,
                      backgroundColor: c.color ?? "hsl(var(--primary))",
                    }}
                  />
                </div>
                <span className={cn(
                  "text-xs font-medium w-10 text-right",
                  c.rate === null ? "text-muted-foreground" : c.rate >= 50 ? "text-emerald-400" : c.rate >= 25 ? "text-yellow-400" : "text-red-400"
                )}>
                  {c.rate != null ? `${c.rate}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Board breakdown */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Revenue by Board</h3>
          <BarChart
            data={Object.entries(data.boardMetrics).map(([board, m]) => ({
              label: board,
              value: m.revenue,
              color: board === "BD" ? "#3b82f6" : board === "Marketing" ? "#8b5cf6" : "#f59e0b",
            }))}
          />
          <div className="mt-4 pt-3 border-t border-white/5">
            <h4 className="text-xs text-muted-foreground mb-2">Win/Loss by Board</h4>
            {Object.entries(data.boardMetrics).map(([board, m]) => (
              <div key={board} className="mb-2">
                <span className="text-xs text-muted-foreground">{board}</span>
                <HorizontalBar
                  segments={[
                    { value: m.won, color: "#10b981", label: "Won" },
                    { value: m.lost, color: "#ef4444", label: "Lost" },
                    { value: m.deals - m.won - m.lost, color: "#6b7280", label: "Open" },
                  ]}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Deal Health */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Deal Health</h3>
          <HorizontalBar
            segments={[
              { value: data.healthDistribution.excellent, color: "#10b981", label: "Excellent" },
              { value: data.healthDistribution.healthy, color: "#3b82f6", label: "Healthy" },
              { value: data.healthDistribution.warning, color: "#f59e0b", label: "Warning" },
              { value: data.healthDistribution.critical, color: "#ef4444", label: "Critical" },
            ]}
            labels
          />

          <h3 className="text-sm font-medium text-foreground mt-6 mb-3">Deal Aging (avg days in stage)</h3>
          <BarChart
            data={data.dealAging.map((d) => ({
              label: `${d.name} (${d.count})`,
              value: d.avg_days,
              color: d.color ?? undefined,
            }))}
          />
        </div>

        {/* Lost Reasons */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Lost Deal Reasons</h3>
          {data.lostReasons.length > 0 ? (
            <BarChart
              data={data.lostReasons.slice(0, 8).map((r) => ({
                label: r.reason,
                value: r.count,
                color: "#ef4444",
              }))}
            />
          ) : (
            <p className="text-xs text-muted-foreground">No lost deals in this period</p>
          )}

          <h3 className="text-sm font-medium text-foreground mt-6 mb-3">Trends</h3>
          <div className="space-y-3">
            <div>
              <span className="text-[11px] text-muted-foreground">Deals Created</span>
              <MiniTrend data={createdTrend} />
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground">Deals Won</span>
              <MiniTrend data={wonTrend} color="#10b981" />
            </div>
          </div>
        </div>
      </div>

      {/* Team Leaderboard */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Team Leaderboard</h3>
        {data.teamLeaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-white/5">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">Name</th>
                  <th className="text-right py-2 font-medium">Deals</th>
                  <th className="text-right py-2 font-medium">Won</th>
                  <th className="text-right py-2 font-medium">Win Rate</th>
                  <th className="text-right py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.teamLeaderboard.map((t, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 text-foreground font-medium">{t.name}</td>
                    <td className="py-2 text-right text-foreground">{t.deals}</td>
                    <td className="py-2 text-right text-emerald-400">{t.won}</td>
                    <td className="py-2 text-right text-foreground">
                      {t.deals > 0 ? `${Math.round((t.won / t.deals) * 100)}%` : "—"}
                    </td>
                    <td className="py-2 text-right text-foreground font-medium">${t.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No team data available</p>
        )}
      </div>
    </div>
  );
}
