"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Search,
  RotateCcw,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  AlertTriangle,
  ShieldAlert,
  Settings2,
  Server,
  FileWarning,
  HelpCircle,
  Timer,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

type TimeRange = "1h" | "24h" | "7d" | "30d";
type StatusFilter = "all" | "completed" | "failed" | "running" | "paused";
type SortCol = "started_at" | "completed_at" | "status";
type SortDir = "asc" | "desc";

interface RunRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  trigger_type: string | null;
  status: string;
  trigger_event: Record<string, unknown> | null;
  error: string | null;
  error_type: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

interface Stats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  paused: number;
  successRate: number | null;
  avgDurationMs: number | null;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const TRIGGER_LABELS: Record<string, string> = {
  deal_stage_change: "Stage Change",
  deal_created: "Deal Created",
  deal_value_change: "Value Change",
  email_received: "Email",
  tg_message: "TG Message",
  calendar_event: "Calendar",
  webhook: "Webhook",
  manual: "Manual",
  deal_stale: "Deal Stale",
  contact_created: "Contact Created",
  task_overdue: "Task Overdue",
  tg_member_joined: "TG Join",
  tg_member_left: "TG Leave",
  deal_won: "Deal Won",
  deal_lost: "Deal Lost",
  scheduled: "Scheduled",
};

const ERROR_TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  timeout: { label: "Timeout", icon: Timer, color: "text-yellow-400" },
  rate_limit: { label: "Rate Limit", icon: AlertTriangle, color: "text-orange-400" },
  auth: { label: "Auth Error", icon: ShieldAlert, color: "text-red-400" },
  config: { label: "Config", icon: Settings2, color: "text-amber-400" },
  server: { label: "Server Error", icon: Server, color: "text-red-400" },
  validation: { label: "Validation", icon: FileWarning, color: "text-yellow-400" },
  unknown: { label: "Unknown", icon: HelpCircle, color: "text-muted-foreground" },
};

export default function AutomationRunsDashboard() {
  const router = useRouter();

  const [timeRange, setTimeRange] = React.useState<TimeRange>("24h");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortCol>("started_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const [runs, setRuns] = React.useState<RunRow[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [comparison, setComparison] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);
  const [retryMsg, setRetryMsg] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounce search input — 300ms delay
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = React.useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({
      time_range: timeRange,
      status: statusFilter,
      search: debouncedSearch,
      sort,
      sort_dir: sortDir,
      limit: "100",
    });
    try {
      const res = await fetch(`/api/workflows/runs?${params}`);
      if (!res.ok) {
        setError(`Failed to load runs (${res.status})`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setRuns(data.runs ?? []);
      setStats(data.stats ?? null);
      setComparison(data.comparison ?? null);
    } catch {
      setError("Network error — could not load runs");
    }
    setLoading(false);
  }, [timeRange, statusFilter, debouncedSearch, sort, sortDir]);

  React.useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-poll when runs are in "running" state
  React.useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running");
    if (hasRunning) {
      pollRef.current = setInterval(fetchData, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runs, fetchData]);

  async function handleRetryFailed() {
    const failedIds = runs.filter((r) => r.status === "failed").map((r) => r.id);
    if (failedIds.length === 0) return;
    setRetrying(true);
    setRetryMsg("");
    try {
      const res = await fetch("/api/workflows/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_failed", run_ids: failedIds }),
      });
      const data = await res.json();
      setRetryMsg(`Retried ${data.retried}${data.errors?.length ? `, ${data.errors.length} errors` : ""}`);
      fetchData();
    } catch {
      setRetryMsg("Retry failed");
    } finally {
      setRetrying(false);
      setTimeout(() => setRetryMsg(""), 4000);
    }
  }

  function toggleSort(col: SortCol) {
    if (sort === col) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSort(col);
      setSortDir("desc");
    }
  }

  // Duration distribution buckets
  const durationBuckets = React.useMemo(() => {
    const buckets = [
      { label: "< 1s", min: 0, max: 1000, count: 0, color: "hsl(160, 60%, 45%)" },
      { label: "1-5s", min: 1000, max: 5000, count: 0, color: "hsl(160, 50%, 40%)" },
      { label: "5-30s", min: 5000, max: 30000, count: 0, color: "hsl(45, 70%, 50%)" },
      { label: "30s-5m", min: 30000, max: 300000, count: 0, color: "hsl(25, 70%, 50%)" },
      { label: "> 5m", min: 300000, max: Infinity, count: 0, color: "hsl(0, 60%, 50%)" },
    ];
    for (const r of runs) {
      if (r.duration_ms == null) continue;
      for (const b of buckets) {
        if (r.duration_ms >= b.min && r.duration_ms < b.max) { b.count++; break; }
      }
    }
    return buckets;
  }, [runs]);

  const failedCount = stats?.failed ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => router.push("/automations")} className="h-8 w-8 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Automation Runs</h1>
            <p className="text-xs text-muted-foreground">Cross-workflow execution history and diagnostics</p>
          </div>
        </div>

        {/* Time range picker */}
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                timeRange === tr.value
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Runs" value={stats.total} comparison={comparison?.total} />
          <StatCard label="Success Rate" value={stats.successRate} comparison={comparison?.successRate} suffix="%" />
          <StatCard label="Avg Duration" value={stats.avgDurationMs != null ? formatMs(stats.avgDurationMs) : null} />
          <StatCard
            label="Failed"
            value={stats.failed}
            comparison={comparison?.failed}
            negative
          />
        </div>
      )}

      {/* Status bar visualization */}
      {stats && stats.total > 0 && (
        <div>
          <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
            {[
              { count: stats.completed, color: "bg-emerald-500" },
              { count: stats.running, color: "bg-blue-500" },
              { count: stats.paused, color: "bg-yellow-500" },
              { count: stats.failed, color: "bg-red-500" },
            ].map((seg, i) => (
              seg.count > 0 ? (
                <div
                  key={i}
                  className={cn("h-full transition-all", seg.color)}
                  style={{ width: `${(seg.count / stats.total) * 100}%` }}
                />
              ) : null
            ))}
          </div>
          <div className="flex gap-4 mt-1.5">
            {[
              { label: "Completed", count: stats.completed, color: "bg-emerald-500" },
              { label: "Running", count: stats.running, color: "bg-blue-500" },
              { label: "Paused", count: stats.paused, color: "bg-yellow-500" },
              { label: "Failed", count: stats.failed, color: "bg-red-500" },
            ].filter(s => s.count > 0).map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", s.color)} />
                <span className="text-[10px] text-muted-foreground">{s.label} ({s.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status chips */}
        <div className="flex items-center gap-1">
          {(["all", "completed", "failed", "running", "paused"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors",
                statusFilter === s
                  ? s === "all" ? "bg-white/15 text-foreground"
                  : s === "completed" ? "bg-emerald-500/20 text-emerald-400"
                  : s === "failed" ? "bg-red-500/20 text-red-400"
                  : s === "running" ? "bg-blue-500/20 text-blue-400"
                  : "bg-yellow-500/20 text-yellow-400"
                  : "bg-white/5 text-muted-foreground/50 hover:bg-white/10"
              )}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflow, error, ID..."
            className="pl-8 h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {retryMsg && <span className="text-[10px] text-primary">{retryMsg}</span>}
          {failedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryFailed}
              disabled={retrying}
              className="h-8 gap-1.5 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10"
            >
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Retry Failed ({failedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Runs table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Workflow</th>
              <th className="px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Status
                  <SortIcon col="status" current={sort} dir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Trigger</th>
              <th className="px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Error</th>
              <th className="px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                <button onClick={() => toggleSort("started_at")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Started
                  <SortIcon col="started_at" current={sort} dir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30 mx-auto" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-xs text-red-400">{error}</p>
                  <button onClick={fetchData} className="text-[10px] text-primary mt-2 hover:underline">
                    Retry
                  </button>
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted-foreground/50">
                  No runs found for this time range
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr
                  key={run.id}
                  className="hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => router.push(`/automations/${run.workflow_id}`)}
                      className="text-xs text-foreground hover:text-primary transition-colors flex items-center gap-1 group/link"
                    >
                      {run.workflow_name}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-50 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] text-muted-foreground">
                      {TRIGGER_LABELS[run.trigger_type ?? ""] ?? run.trigger_type ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    {run.error ? (
                      <div className="flex items-center gap-1.5">
                        <ErrorTypeBadge type={run.error_type} />
                        <span className="text-[10px] text-red-400/70 truncate" title={run.error}>
                          {run.error.length > 40 ? run.error.slice(0, 40) + "..." : run.error}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] text-muted-foreground" title={run.started_at}>
                      {timeAgo(run.started_at)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {run.duration_ms != null ? formatMs(run.duration_ms) : "—"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Duration distribution */}
      {durationBuckets.some(b => b.count > 0) && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3">Duration Distribution</p>
          <div className="space-y-2">
            {durationBuckets.map((b) => {
              const maxCount = Math.max(...durationBuckets.map(x => x.count), 1);
              return (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14 text-right">{b.label}</span>
                  <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max((b.count / maxCount) * 100, b.count > 0 ? 2 : 0)}%`,
                        backgroundColor: b.color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-foreground w-8 text-right">{b.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Components ────────────────────────────────────────── */

function StatCard({ label, value, comparison, suffix, negative }: {
  label: string;
  value: number | string | null;
  comparison?: number | null;
  suffix?: string;
  negative?: boolean;
}) {
  const numVal = typeof value === "number" ? value : null;
  const delta = typeof comparison === "number" && numVal !== null ? numVal - comparison : null;
  const pctChange = delta !== null && typeof comparison === "number" && comparison !== 0
    ? Math.round((delta / comparison) * 100)
    : null;

  // For "failed" card, increase is bad (negative=true inverts color)
  const isPositive = negative ? (pctChange !== null && pctChange <= 0) : (pctChange !== null && pctChange >= 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">
        {value != null ? <>{typeof value === "number" ? value.toLocaleString() : value}{suffix}</> : "—"}
      </p>
      {pctChange !== null && (
        <p className={cn("text-xs mt-1", isPositive ? "text-emerald-400" : "text-red-400")}>
          {pctChange >= 0 ? "+" : ""}{pctChange}% vs previous
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    completed: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
    running: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10" },
    paused: { icon: PauseCircle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  };
  const c = config[status] ?? { icon: Clock, color: "text-muted-foreground", bg: "bg-white/5" };
  const Icon = c.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", c.bg, c.color)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ErrorTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const meta = ERROR_TYPE_META[type] ?? ERROR_TYPE_META.unknown;
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 shrink-0", meta.color)} title={meta.label}>
      <Icon className="h-3 w-3" />
    </span>
  );
}

function SortIcon({ col, current, dir }: { col: string; current: string; dir: SortDir }) {
  if (col !== current) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  return dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}
