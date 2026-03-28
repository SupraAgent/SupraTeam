import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const dealId = searchParams.get("deal_id");

  if (!dealId) {
    return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_deal_participants")
    .select("*, contact:crm_contacts(id, name, company, telegram_username)")
    .eq("deal_id", dealId)
    .order("added_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [], source: "supabase" });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const { deal_id, contact_id, role, notes } = body;

  if (!deal_id || !contact_id) {
    return NextResponse.json({ error: "deal_id and contact_id are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_deal_participants")
    .insert({
      deal_id,
      contact_id,
      role: role ?? "involved",
      notes: notes ?? null,
      added_by: user.id,
    })
    .select("*, contact:crm_contacts(id, name, company, telegram_username)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const body = await request.json();
  const { id, role, notes } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from("crm_deal_participants")
    .update(updates)
    .eq("id", id)
    .select("*, contact:crm_contacts(id, name, company, telegram_username)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_deal_participants")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, source: "supabase" });
}
