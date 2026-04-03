import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;
  const { id } = await params;

  // Fetch template
  const { data: template, error: fetchErr } = await supabase
    .from("crm_workflow_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Create workflow from template
  const { data: workflow, error: createErr } = await supabase
    .from("crm_workflows")
    .insert({
      name: template.name,
      description: template.description,
      nodes: template.nodes,
      edges: template.edges,
      trigger_type: template.trigger_type,
      created_by: user.id,
    })
    .select()
    .single();

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  // Increment use_count
  await supabase
    .from("crm_workflow_templates")
    .update({ use_count: (template.use_count ?? 0) + 1 })
    .eq("id", id);

  return NextResponse.json({ workflow, ok: true });
}
