import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET: Load a single Loop Builder workflow (full nodes/edges).
 * PUT: Update a workflow (nodes, edges, name, etc.).
 * DELETE: Delete a workflow.
 *
 * All operations verify ownership — only the workflow creator or an
 * admin_lead can access/modify a workflow.
 */

async function verifyOwnership(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  workflowId: string,
  userId: string,
) {
  // Check if user is admin — admins can access all workflows
  const { data: profile } = await supabase
    .from("profiles")
    .select("crm_role")
    .eq("id", userId)
    .single();
  if (profile?.crm_role === "admin_lead") return null;

  const { data } = await supabase
    .from("crm_workflows")
    .select("id")
    .eq("id", workflowId)
    .eq("created_by", userId)
    .single();
  if (!data) {
    return NextResponse.json({ error: "Workflow not found or access denied" }, { status: 404 });
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ownerErr = await verifyOwnership(supabase, id, auth.user.id);
  if (ownerErr) return ownerErr;

  const { data, error } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  return NextResponse.json({ workflow: data });
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ownerErr = await verifyOwnership(supabase, id, auth.user.id);
  if (ownerErr) return ownerErr;

  // Build update object — only include fields that were provided
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("name" in body && typeof body.name === "string") update.name = body.name.trim();
  if ("description" in body) update.description = body.description ?? null;
  if ("is_active" in body && typeof body.is_active === "boolean") update.is_active = body.is_active;
  if ("trigger_type" in body) update.trigger_type = body.trigger_type ?? null;

  // If nodes or edges changed, bump version atomically via RPC
  const bumpVersion = "nodes" in body || "edges" in body;
  if ("nodes" in body) update.nodes = body.nodes;
  if ("edges" in body) update.edges = body.edges;

  const { data, error } = await supabase
    .from("crm_workflows")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Atomically bump version when nodes/edges changed (avoids SELECT+UPDATE race)
  if (bumpVersion && data) {
    const { error: rpcError } = await supabase.rpc("increment_workflow_version", { wf_id: id });
    if (rpcError) {
      // Fallback: non-atomic increment if RPC doesn't exist
      await supabase.from("crm_workflows").update({ version: (data.version ?? 0) + 1 }).eq("id", id);
    }
  }

  return NextResponse.json({ workflow: data, ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ownerErr = await verifyOwnership(supabase, id, auth.user.id);
  if (ownerErr) return ownerErr;

  const { error } = await supabase
    .from("crm_workflows")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
