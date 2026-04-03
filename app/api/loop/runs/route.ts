import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const MAX_RETRY_BATCH = 20;

/** GET /api/loop/runs — global run dashboard for Loop Builder workflows */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

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

  // Helper: apply shared filters — scoped to Loop Builder workflows only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(query: any) {
    let q = query
      .gte("started_at", rangeFrom.toISOString())
      .lte("started_at", rangeTo.toISOString());

    if (status && status !== "all") {
      q = q.eq("status", status);
    }
    if (triggerType && triggerType !== "all") {
      q = q.eq("crm_workflows.trigger_type", triggerType);
    }
    if (search) {
      const sanitized = search.replace(/[%_(),.\\]/g, "");
      if (sanitized) {
        q = q.or(`error.ilike.%${sanitized}%,id.ilike.%${sanitized}%`);
      }
    }
    return q;
  }

  // Main query — filter to Loop Builder workflows via builder_type
  let query = applyFilters(
    supabase
      .from("crm_workflow_runs")
      .select("id, workflow_id, status, trigger_event, error, started_at, completed_at, duration_ms, failure_type, retry_count, workflow_version, crm_workflows!workflow_id(id, name, trigger_type, builder_type)")
  );

  const validSorts = ["started_at", "completed_at", "status"];
  const sortCol = validSorts.includes(sort) ? sort : "started_at";
  query = query.order(sortCol, { ascending: sortDir });
  query = query.range(offset, offset + limit - 1);

  const { data: runs, error: runsErr } = await query;

  if (runsErr) {
    return NextResponse.json({ error: runsErr.message }, { status: 500 });
  }

  // Filter to loop builder workflows client-side (Supabase doesn't support
  // filtering on joined columns in the same query reliably for all operators)
  const loopRuns = (runs ?? []).filter((r: Record<string, unknown>) => {
    const wf = r.crm_workflows as { builder_type?: string } | null;
    return wf?.builder_type === "loop";
  });

  const mapped = loopRuns.map((r: Record<string, unknown>) => {
    const wf = r.crm_workflows as { id: string; name: string; trigger_type: string | null } | null;
    const error = (r.error as string | null) ?? null;
    return {
      id: r.id as string,
      workflow_id: r.workflow_id as string,
      workflow_name: wf?.name ?? "Unknown",
      trigger_type: wf?.trigger_type ?? null,
      status: r.status as string,
      trigger_event: r.trigger_event,
      error,
      error_type: error ? classifyError(error) : (r.failure_type as string | null),
      started_at: r.started_at as string,
      completed_at: r.completed_at as string | null,
      duration_ms: r.duration_ms as number | null,
      retry_count: r.retry_count as number,
      workflow_version: r.workflow_version as number | null,
    };
  });

  // Stats for current period
  const statsQuery = applyFilters(
    supabase
      .from("crm_workflow_runs")
      .select("status, started_at, completed_at, duration_ms, crm_workflows!workflow_id(trigger_type, builder_type)")
  );
  const { data: allRuns } = await statsQuery;
  const loopAllRuns = (allRuns ?? []).filter((r: Record<string, unknown>) => {
    const wf = r.crm_workflows as { builder_type?: string } | null;
    return wf?.builder_type === "loop";
  });
  const stats = computeStats(loopAllRuns);

  // Comparison period stats
  let comparison = null;
  if (compareFrom && compareTo) {
    let compQuery = supabase
      .from("crm_workflow_runs")
      .select("status, started_at, completed_at, duration_ms, crm_workflows!workflow_id(trigger_type, builder_type)")
      .gte("started_at", compareFrom.toISOString())
      .lte("started_at", compareTo.toISOString());

    if (status && status !== "all") {
      compQuery = compQuery.eq("status", status);
    }
    if (triggerType && triggerType !== "all") {
      compQuery = compQuery.eq("crm_workflows.trigger_type", triggerType);
    }

    const { data: compRuns } = await compQuery;
    const loopCompRuns = (compRuns ?? []).filter((r: Record<string, unknown>) => {
      const wf = r.crm_workflows as { builder_type?: string } | null;
      return wf?.builder_type === "loop";
    });
    comparison = computeStats(loopCompRuns);
  }

  return NextResponse.json({ runs: mapped, stats, comparison });
}

/** POST /api/loop/runs — retry failed runs */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "retry_failed") {
    const rawIds = body.run_ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: "run_ids must be a non-empty array" }, { status: 400 });
    }

    const runIds = rawIds
      .filter((id): id is string => typeof id === "string")
      .slice(0, MAX_RETRY_BATCH);

    if (runIds.length === 0) {
      return NextResponse.json({ error: "No valid run IDs provided" }, { status: 400 });
    }

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

    const { executeLoopWorkflow } = await import("@/lib/loop-workflow-engine");

    for (const run of failedRuns) {
      try {
        const event = (run.trigger_event as Record<string, unknown>) ?? { type: "manual" };
        await executeLoopWorkflow(run.workflow_id, {
          type: (event.type as string) ?? "manual",
          dealId: event.dealId as string | undefined,
          contactId: event.contactId as string | undefined,
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

/** DELETE /api/loop/runs — bulk delete runs by time range and status */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const timeRange = url.searchParams.get("time_range") ?? "24h";

  const hours: Record<string, number> = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 };
  const h = hours[timeRange] ?? 24;
  const rangeFrom = new Date(Date.now() - h * 3600000);

  // Only delete runs belonging to Loop Builder workflows
  // First, get loop workflow IDs
  const { data: loopWfs } = await supabase
    .from("crm_workflows")
    .select("id")
    .eq("builder_type", "loop");
  const loopIds = (loopWfs ?? []).map((w: { id: string }) => w.id);

  if (loopIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  let query = supabase
    .from("crm_workflow_runs")
    .delete({ count: "exact" })
    .in("workflow_id", loopIds)
    .gte("started_at", rangeFrom.toISOString())
    .neq("status", "running");

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}

function computeStats(runs: Record<string, unknown>[]) {
  const total = runs.length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running").length;
  const paused = runs.filter((r) => r.status === "paused").length;

  const durations = runs
    .filter((r) => r.duration_ms != null)
    .map((r) => r.duration_ms as number)
    .concat(
      runs
        .filter((r) => r.duration_ms == null && r.completed_at && r.started_at)
        .map((r) => new Date(r.completed_at as string).getTime() - new Date(r.started_at as string).getTime())
    );

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
