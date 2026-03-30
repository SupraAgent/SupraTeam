import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";
import { verifyLoopOwnership } from "@/lib/loop-auth";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/loop/workflows/[id]/runs — list recent runs for a Loop Builder workflow */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ownerErr = await verifyLoopOwnership(supabase, id, auth.user.id);
  if (ownerErr) return ownerErr;

  const { data, error } = await supabase
    .from("crm_workflow_runs")
    .select("id, status, trigger_event, node_outputs, error, started_at, completed_at, duration_ms, retry_count")
    .eq("workflow_id", id)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}

/** DELETE /api/loop/workflows/[id]/runs — delete runs for a Loop Builder workflow */
export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ownerErr = await verifyLoopOwnership(supabase, id, auth.user.id);
  if (ownerErr) return ownerErr;

  const url = new URL(request.url);
  const runId = url.searchParams.get("run_id");
  const mode = url.searchParams.get("mode"); // "all" | "failed" | single

  let query = supabase.from("crm_workflow_runs").delete().eq("workflow_id", id);

  if (mode === "all") {
    // Delete all runs for this workflow
  } else if (mode === "failed") {
    query = query.eq("status", "failed");
  } else if (runId) {
    query = query.eq("id", runId);
  } else {
    return NextResponse.json({ error: "Provide run_id or mode" }, { status: 400 });
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
