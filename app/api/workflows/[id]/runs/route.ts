import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from("crm_workflow_runs")
    .select("id, status, trigger_event, node_outputs, error, started_at, completed_at")
    .eq("workflow_id", id)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { id } = await params;

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
