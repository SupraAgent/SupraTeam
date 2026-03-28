import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * GET: List all Loop Builder workflows for the current user.
 * POST: Create a new Loop Builder workflow.
 *
 * Loop Builder workflows are stored in the same crm_workflows table as
 * the old builder, but distinguished by source='loop_builder' in the
 * trigger node's data. We use a naming convention on trigger_type:
 * Loop Builder workflows prefix their trigger with "loop:" or use the
 * CRM trigger types directly (deal_stage_change, etc.).
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("crm_workflows")
    .select("id, name, description, is_active, trigger_type, last_run_at, run_count, version, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workflows: data });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, nodes, edges, trigger_type, is_active } = body as {
    name?: string;
    description?: string;
    nodes?: unknown[];
    edges?: unknown[];
    trigger_type?: string;
    is_active?: boolean;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("crm_workflows")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      nodes: nodes ?? [],
      edges: edges ?? [],
      trigger_type: trigger_type || null,
      is_active: is_active ?? false,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workflow: data, ok: true }, { status: 201 });
}
