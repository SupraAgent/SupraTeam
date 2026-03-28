import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data, error } = await supabase
    .from("crm_sla_config")
    .select("*")
    .order("board_type", { ascending: true, nullsFirst: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configs: data ?? [] });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { id, warning_hours, breach_hours, is_active, escalate_to_role } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (warning_hours !== undefined) updates.warning_hours = warning_hours;
  if (breach_hours !== undefined) updates.breach_hours = breach_hours;
  if (is_active !== undefined) updates.is_active = is_active;
  if (escalate_to_role !== undefined) updates.escalate_to_role = escalate_to_role;

  const { error } = await supabase
    .from("crm_sla_config")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
