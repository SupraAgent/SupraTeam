import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data, error } = await supabase
    .from("crm_workflow_templates")
    .select("*")
    .order("category", { ascending: true })
    .order("use_count", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const { name, description, tags, nodes, edges, trigger_type } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_workflow_templates")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      category: "custom",
      tags: tags ?? [],
      trigger_type: trigger_type ?? null,
      nodes: nodes ?? [],
      edges: edges ?? [],
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data, ok: true });
}
