import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("crm_automation_rules")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[automation-rules]", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const { name, trigger_type, trigger_config, condition_config, action_type, action_config } = body;

  if (!name || !trigger_type || !action_type) {
    return NextResponse.json({ error: "name, trigger_type, and action_type required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_automation_rules")
    .insert({
      name,
      trigger_type,
      trigger_config: trigger_config ?? {},
      condition_config: condition_config ?? {},
      action_type,
      action_config: action_config ?? {},
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[automation-rules]", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ rule: data, ok: true });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Allowlist of fields that can be updated
  const allowedFields = ["name", "description", "trigger_type", "trigger_config", "condition_config", "action_type", "action_config", "is_active"] as const;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from("crm_automation_rules")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[automation-rules]", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ rule: data, ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_automation_rules")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[automation-rules]", error.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
