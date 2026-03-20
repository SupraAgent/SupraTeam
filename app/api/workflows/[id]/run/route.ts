import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { executeWorkflow } from "@/lib/workflow-engine";

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

  // Accept optional deal_id in body for context
  let dealId: string | undefined;
  try {
    const body = await request.json();
    dealId = body.deal_id;
  } catch {
    // No body is fine for manual triggers
  }

  const result = await executeWorkflow(id, {
    type: "manual",
    dealId,
    payload: { triggered_by: user.email ?? user.id },
  });

  return NextResponse.json({
    ok: result.status !== "failed",
    run_id: result.runId,
    status: result.status,
    error: result.error,
  });
}
