import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET /api/workflows/runs/nodes?run_id=X — fetch per-node execution details */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const url = new URL(request.url);
  const runId = url.searchParams.get("run_id");

  if (!runId) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_workflow_node_executions")
    .select("id, node_id, node_type, node_label, input_data, output_data, error_message, status, started_at, completed_at, duration_ms")
    .eq("run_id", runId)
    .order("started_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nodes: data ?? [] });
}
