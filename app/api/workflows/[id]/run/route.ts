import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { executeWorkflow, executeWorkflowDryRun } from "@/lib/workflow-engine";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;
  const { id } = await params;

  // Verify workflow exists
  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("id, name, trigger_type")
    .eq("id", id)
    .single();

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  // Accept optional deal_id and test_mode in body
  let dealId: string | undefined;
  let testMode = false;
  try {
    const body = await request.json();
    dealId = body.deal_id;
    testMode = body.test_mode === true;
  } catch {
    // No body is fine for manual triggers
  }

  const event = {
    type: testMode ? "test" : "manual",
    dealId,
    payload: { triggered_by: user.email ?? user.id },
  };

  const result = testMode
    ? await executeWorkflowDryRun(id, event)
    : await executeWorkflow(id, event);

  return NextResponse.json({
    ok: result.status !== "failed",
    run_id: result.runId,
    status: result.status,
    error: result.error,
    test_mode: testMode,
    node_outputs: testMode ? result.nodeOutputs : undefined,
  });
}
