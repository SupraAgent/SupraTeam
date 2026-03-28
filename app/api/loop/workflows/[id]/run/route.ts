import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { executeLoopWorkflow, executeLoopWorkflowDryRun } from "@/lib/loop-workflow-engine";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: Execute a Loop Builder workflow server-side.
 *
 * Body: {
 *   deal_id?: string,      — Deal context for template vars
 *   contact_id?: string,   — Contact context
 *   test_mode?: boolean,   — Dry-run (no side effects)
 *   payload?: Record       — Extra event payload
 * }
 *
 * This is the bridge between the Loop Builder UI "Run" button and the
 * server-side CRM execution engine. The same endpoint is called by
 * event triggers (deal stage changes, etc.).
 */
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is OK — manual trigger with no context
  }

  const testMode = body.test_mode === true;
  const event = {
    type: "manual",
    dealId: body.deal_id as string | undefined,
    contactId: body.contact_id as string | undefined,
    payload: (body.payload as Record<string, unknown>) ?? {},
  };

  try {
    const result = testMode
      ? await executeLoopWorkflowDryRun(id, event)
      : await executeLoopWorkflow(id, event);

    return NextResponse.json({
      ok: result.status !== "failed",
      run_id: result.runId,
      status: result.status,
      error: result.error,
      node_outputs: testMode ? result.nodeOutputs : undefined,
      test_mode: testMode,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Execution failed" },
      { status: 500 }
    );
  }
}
