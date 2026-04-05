import { NextResponse } from "next/server";
import { requireAuth, requireLeadRole } from "@/lib/auth-guard";

const ALLOWED_FIELDS = ["name", "domain", "industry", "website", "description", "logo_url", "employee_count", "location", "tvl", "chain_deployments", "token_status", "funding_stage", "protocol_type"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { data: company, error } = await supabase
    .from("crm_companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Fetch linked contacts
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, email, telegram_username, title")
    .eq("company_id", id)
    .order("name");

  // Fetch linked TG groups
  const { data: groups } = await supabase
    .from("tg_groups")
    .select("id, group_name, telegram_group_id, bot_is_admin, member_count")
    .eq("company_id", id)
    .order("group_name");

  return NextResponse.json({ company, contacts: contacts ?? [], groups: groups ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key];
  }

  const { data: company, error } = await supabase
    .from("crm_companies")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[api/companies] update error:", error);
    return NextResponse.json({ error: "Failed to update company" }, { status: 500 });
  }

  return NextResponse.json({ company, ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { error } = await supabase
    .from("crm_companies")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[api/companies] delete error:", error);
    return NextResponse.json({ error: "Failed to delete company" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
