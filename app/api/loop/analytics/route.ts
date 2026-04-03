import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

type Period = "24h" | "7d" | "30d" | "all";

const PERIOD_HOURS: Record<Period, number | null> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  all: null,
};

/** GET /api/loop/analytics — aggregated workflow run statistics */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const period = (url.searchParams.get("period") ?? "7d") as Period;
  const hours = PERIOD_HOURS[period] ?? PERIOD_HOURS["7d"];

  const now = new Date();
  const rangeFrom = hours
    ? new Date(now.getTime() - hours * 3600000)
    : new Date("2000-01-01");

  // ── Fetch all runs in range ──────────────────────────────────
  let runsQuery = supabase
    .from("crm_workflow_runs")
    .select("id, workflow_id, status, error, started_at, completed_at, duration_ms")
    .gte("started_at", rangeFrom.toISOString())
    .lte("started_at", now.toISOString())
    .order("started_at", { ascending: false })
    .limit(5000);

  const { data: runs, error: runsError } = await runsQuery;
  if (runsError) {
    return NextResponse.json({ error: runsError.message }, { status: 500 });
  }

  const allRuns = runs ?? [];
  const totalRuns = allRuns.length;
  const completedRuns = allRuns.filter((r) => r.status === "completed").length;
  const failedRuns = allRuns.filter((r) => r.status === "failed").length;
  const runningRuns = allRuns.filter((r) => r.status === "running").length;
  const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 1000) / 10 : 0;

  const durations = allRuns
    .filter((r) => r.duration_ms != null)
    .map((r) => r.duration_ms as number);
  const avgDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  // ── Runs by status ───────────────────────────────────────────
  const runsByStatus: Record<string, number> = {
    completed: completedRuns,
    failed: failedRuns,
    running: runningRuns,
  };

  // ── Top errors ───────────────────────────────────────────────
  const errorCounts = new Map<string, number>();
  for (const run of allRuns) {
    if (run.error) {
      const key = run.error.length > 120 ? run.error.slice(0, 120) : run.error;
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
  }
  const topErrors = [...errorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([error, count]) => ({ error, count }));

  // ── Runs by workflow ─────────────────────────────────────────
  const byWorkflow = new Map<
    string,
    { runs: number; completed: number; totalDuration: number; durationCount: number }
  >();
  for (const run of allRuns) {
    if (!run.workflow_id) continue;
    const existing = byWorkflow.get(run.workflow_id) ?? {
      runs: 0,
      completed: 0,
      totalDuration: 0,
      durationCount: 0,
    };
    existing.runs++;
    if (run.status === "completed") existing.completed++;
    if (run.duration_ms != null) {
      existing.totalDuration += run.duration_ms;
      existing.durationCount++;
    }
    byWorkflow.set(run.workflow_id, existing);
  }

  // Fetch workflow names
  const workflowIds = [...byWorkflow.keys()];
  let workflowNames: Record<string, string> = {};
  if (workflowIds.length > 0) {
    const { data: workflows } = await supabase
      .from("crm_workflows")
      .select("id, name")
      .in("id", workflowIds);
    if (workflows) {
      workflowNames = Object.fromEntries(workflows.map((w) => [w.id, w.name]));
    }
  }

  const runsByWorkflow = [...byWorkflow.entries()]
    .map(([id, stats]) => ({
      id,
      name: workflowNames[id] ?? "Unknown Workflow",
      runs: stats.runs,
      successRate:
        stats.runs > 0
          ? Math.round((stats.completed / stats.runs) * 1000) / 10
          : 0,
      avgDurationMs:
        stats.durationCount > 0
          ? Math.round(stats.totalDuration / stats.durationCount)
          : 0,
    }))
    .sort((a, b) => b.runs - a.runs);

  // ── Time-bucketed activity ─────────────────────────────────
  // Use daily buckets for 7d+ ranges to avoid overwhelming the chart
  const useDailyBuckets = hours !== null && hours >= 168;
  const bucketMap = new Map<string, { count: number; failed: number }>();
  for (const run of allRuns) {
    const d = new Date(run.started_at);
    if (useDailyBuckets) {
      d.setHours(0, 0, 0, 0);
    } else {
      d.setMinutes(0, 0, 0);
    }
    const key = d.toISOString();
    const existing = bucketMap.get(key) ?? { count: 0, failed: 0 };
    existing.count++;
    if (run.status === "failed") existing.failed++;
    bucketMap.set(key, existing);
  }
  const hourlyRuns = [...bucketMap.entries()]
    .map(([hour, stats]) => ({ hour, count: stats.count, failed: stats.failed }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  return NextResponse.json({
    totalRuns,
    successRate,
    avgDurationMs,
    failedRuns,
    runsByStatus,
    topErrors,
    runsByWorkflow,
    hourlyRuns,
    truncated: allRuns.length >= 5000,
  });
}
