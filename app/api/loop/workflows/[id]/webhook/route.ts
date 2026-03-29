/**
 * POST /api/loop/workflows/[id]/webhook — External webhook trigger for Loop/A2 workflows
 * Allows external services to trigger a workflow via HTTP POST.
 * No auth required (external). Validates webhook_secret if configured.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { executeLoopWorkflow } from "@/lib/loop-workflow-engine";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate UUID format early
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid workflow ID" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  // Load workflow — only webhook-triggered, active workflows
  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .eq("trigger_type", "webhook")
    .single();

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found or inactive" }, { status: 404 });
  }

  // Validate webhook secret if the workflow has one configured
  const webhookSecret = (workflow.metadata as Record<string, unknown> | null)?.webhook_secret as string | undefined;
  if (webhookSecret) {
    const providedSecret = request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    if (!providedSecret ||
      providedSecret.length !== webhookSecret.length ||
      !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(webhookSecret))) {
      return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
    }
  }

  // Parse payload
  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = await request.json();
  } catch {
    // Empty body is fine
  }

  // Extract and separate internal fields from payload
  const { deal_id, contact_id, ...payload } = rawPayload;
  const dealId = typeof deal_id === "string" ? deal_id : undefined;
  const contactId = typeof contact_id === "string" ? contact_id : undefined;

  try {
    const result = await executeLoopWorkflow(id, {
      type: "webhook",
      dealId,
      contactId,
      payload,
    });

    return NextResponse.json({
      ok: true,
      run_id: result.runId,
      status: result.status,
      error: result.error,
    });
  } catch (err) {
    console.error("[loop-webhook] execution error:", err);
    return NextResponse.json(
      { error: "Workflow execution failed" },
      { status: 500 }
    );
  }
}
