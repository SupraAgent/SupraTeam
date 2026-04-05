/**
 * GET  /api/workflows/dlq — List DLQ items (optionally filter by workflow_id, status).
 * POST /api/workflows/dlq — Re-queue a DLQ item for retry.
 * DELETE /api/workflows/dlq — Discard a DLQ item.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const workflowId = searchParams.get("workflow_id");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  let query = supabase
    .from("crm_workflow_dlq")
    .select("*, workflow:crm_workflows(id, name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (workflowId) query = query.eq("workflow_id", workflowId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = await request.json();
  const { dlq_id } = body;

  if (!dlq_id) {
    return NextResponse.json({ error: "dlq_id required" }, { status: 400 });
  }

  // Fetch the DLQ item
  const { data: item } = await supabase
    .from("crm_workflow_dlq")
    .select("*")
    .eq("id", dlq_id)
    .single();

  if (!item) {
    return NextResponse.json({ error: "DLQ item not found" }, { status: 404 });
  }

  if (item.status === "discarded" || item.status === "resolved") {
    return NextResponse.json({ error: `Cannot re-queue item with status '${item.status}'` }, { status: 400 });
  }

  // Reset retry count and schedule immediate retry
  const { error } = await supabase
    .from("crm_workflow_dlq")
    .update({
      status: "pending",
      retry_count: 0,
      next_retry_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", dlq_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Item re-queued for retry" });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const dlqId = searchParams.get("dlq_id");

  if (!dlqId) {
    return NextResponse.json({ error: "dlq_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_workflow_dlq")
    .update({
      status: "discarded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", dlqId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Item discarded" });
}
