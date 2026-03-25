import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const triggerType = url.searchParams.get("trigger_type");
  const timeRange = url.searchParams.get("time_range") ?? "24h";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const search = url.searchParams.get("search");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const sort = url.searchParams.get("sort") ?? "started_at";
  const sortDir = url.searchParams.get("sort_dir") === "asc" ? true : false;

  // Compute time boundaries
  const now = new Date();
  let rangeFrom: Date;
  let rangeTo = now;
  let compareFrom: Date | undefined;
  let compareTo: Date | undefined;

  if (timeRange === "custom" && from) {
    rangeFrom = new Date(from);
    rangeTo = to ? new Date(to) : now;
    const span = rangeTo.getTime() - rangeFrom.getTime();
    compareFrom = new Date(rangeFrom.getTime() - span);
    compareTo = new Date(rangeFrom.getTime());
  } else {
    const hours: Record<string, number> = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 };
    const h = hours[timeRange] ?? 24;
    rangeFrom = new Date(now.getTime() - h * 3600000);
    compareFrom = new Date(rangeFrom.getTime() - h * 3600000);
    compareTo = new Date(rangeFrom.getTime());
  }

  // Build main query
  let query = supabase
    .from("crm_workflow_runs")
    .select("id, workflow_id, status, trigger_event, error, started_at, completed_at, node_outputs, crm_workflows!workflow_id(id, name, trigger_type)")
    .gte("started_at", rangeFrom.toISOString())
    .lte("started_at", rangeTo.toISOString());

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  // Sort
  const validSorts = ["started_at", "completed_at", "status"];
  const sortCol = validSorts.includes(sort) ? sort : "started_at";
  query = query.order(sortCol, { ascending: sortDir });
  query = query.range(offset, offset + limit - 1);

  const { data: runs, error: runsErr } = await query;

  if (runsErr) {
    return NextResponse.json({ error: runsErr.message }, { status: 500 });
  }

  // Post-filter by trigger_type and search (join fields)
  let filtered = (runs ?? []).map((r: Record<string, unknown>) => {
    const wf = r.crm_workflows as { id: string; name: string; trigger_type: string | null } | null;
    const id = r.id as string;
    const error = (r.error as string | null) ?? null;
    const startedAt = r.started_at as string;
    const completedAt = r.completed_at as string | null;
    return {
      id,
      workflow_id: r.workflow_id as string,
      workflow_name: wf?.name ?? "Unknown",
      trigger_type: wf?.trigger_type ?? null,
      status: r.status as string,
      trigger_event: r.trigger_event,
      error,
      error_type: classifyError(error),
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: completedAt && startedAt
        ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
        : null,
      node_outputs: r.node_outputs,
    };
  });

  if (triggerType && triggerType !== "all") {
    filtered = filtered.filter((r) => r.trigger_type === triggerType);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((r) =>
      r.workflow_name.toLowerCase().includes(q) ||
      (r.error && r.error.toLowerCase().includes(q)) ||
      r.id.toLowerCase().includes(q)
    );
  }

  // Aggregate stats for current period (from all matching runs, not just the page)
  const { data: allRuns } = await supabase
    .from("crm_workflow_runs")
    .select("status, started_at, completed_at")
    .gte("started_at", rangeFrom.toISOString())
    .lte("started_at", rangeTo.toISOString());

  const stats = computeStats(allRuns ?? []);

  // Comparison period stats
  let comparison = null;
  if (compareFrom && compareTo) {
    const { data: compRuns } = await supabase
      .from("crm_workflow_runs")
      .select("status, started_at, completed_at")
      .gte("started_at", compareFrom.toISOString())
      .lte("started_at", compareTo.toISOString());
    comparison = computeStats(compRuns ?? []);
  }

  return NextResponse.json({ runs: filtered, stats, comparison });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const body = await request.json();

  if (body.action === "retry_failed") {
    const runIds: string[] = body.run_ids ?? [];
    if (runIds.length === 0) {
      return NextResponse.json({ error: "No run IDs provided" }, { status: 400 });
    }

    // Fetch failed runs with their workflow IDs and trigger events
    const { data: failedRuns } = await supabase
      .from("crm_workflow_runs")
      .select("id, workflow_id, trigger_event")
      .in("id", runIds)
      .eq("status", "failed");

    if (!failedRuns || failedRuns.length === 0) {
      return NextResponse.json({ retried: 0, errors: ["No failed runs found"] });
    }

    const errors: string[] = [];
    let retried = 0;

    // Dynamic import to avoid client component bundling issue
    const { executeWorkflow } = await import("@/lib/workflow-engine");

    // Process sequentially to avoid rate limits
    for (const run of failedRuns) {
      try {
        const event = (run.trigger_event as Record<string, unknown>) ?? { type: "manual" };
        await executeWorkflow(run.workflow_id, {
          type: (event.type as string) ?? "manual",
          dealId: event.dealId as string | undefined,
          payload: { ...(event.payload as Record<string, unknown> ?? {}), retried_from: run.id },
        });
        retried++;
      } catch (err) {
        errors.push(`${run.id.slice(0, 8)}: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({ retried, errors });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function computeStats(runs: { status: unknown; started_at: unknown; completed_at: unknown }[]) {
  const total = runs.length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running").length;
  const paused = runs.filter((r) => r.status === "paused").length;

  const durations = runs
    .filter((r) => r.completed_at && r.started_at)
    .map((r) => new Date(r.completed_at as string).getTime() - new Date(r.started_at as string).getTime());
  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : null;

  return { total, completed, failed, running, paused, successRate, avgDurationMs };
}

function classifyError(error: string | null): string | null {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes("timeout") || e.includes("etimedout") || e.includes("timed out")) return "timeout";
  if (e.includes("429") || e.includes("rate limit") || e.includes("too many")) return "rate_limit";
  if (e.includes("401") || e.includes("403") || e.includes("unauthorized") || e.includes("forbidden")) return "auth";
  if (e.includes("not connected") || e.includes("add token") || e.includes("not configured")) return "config";
  if (e.includes("500") || e.includes("503") || e.includes("server error")) return "server";
  if (e.includes("invalid") || e.includes("required") || e.includes("missing")) return "validation";
  return "unknown";
}
