/**
 * POST /api/workflows/[id]/webhook — External webhook trigger for workflows
 * Allows external services to trigger a workflow via HTTP POST.
 * Accepts JSON payload which is passed as event.payload to the workflow.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { executeWorkflowFromData } from "@/lib/workflow-engine";
import type { Workflow } from "@/lib/workflow-db-types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  // Load workflow
  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found or inactive" }, { status: 404 });
  }

  // Verify it's a webhook-triggered workflow
  if (workflow.trigger_type !== "webhook" && workflow.trigger_type !== "manual") {
    return NextResponse.json(
      { error: "Workflow is not webhook-triggered" },
      { status: 400 }
    );
  }

  // Parse payload
  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // Empty body is fine
  }

  // Extract dealId/contactId if provided in payload
  const dealId = (payload.deal_id as string) ?? undefined;
  const contactId = (payload.contact_id as string) ?? undefined;

  // Remove internal fields from payload
  delete payload.deal_id;
  delete payload.contact_id;

  try {
    const result = await executeWorkflowFromData(
      workflow as unknown as Workflow,
      {
        type: "webhook",
        dealId,
        contactId,
        payload,
      },
      supabase
    );

    return NextResponse.json({
      ok: true,
      run_id: result.runId,
      status: result.status,
      error: result.error,
    });
  } catch (err) {
    console.error("[webhook] execution error:", err);
    return NextResponse.json(
      { error: "Workflow execution failed" },
      { status: 500 }
    );
  }
}
