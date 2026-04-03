import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { contact_a_id, contact_b_id, relationship_type, label, notes } = body;

  if (!contact_a_id || !contact_b_id || !relationship_type) {
    return NextResponse.json({ error: "contact_a_id, contact_b_id, and relationship_type are required" }, { status: 400 });
  }

  if (contact_a_id === contact_b_id) {
    return NextResponse.json({ error: "Cannot create self-relationship" }, { status: 400 });
  }

  // Normalize ordering to match the bidirectional unique index (LEAST/GREATEST)
  const [normalA, normalB] = contact_a_id < contact_b_id ? [contact_a_id, contact_b_id] : [contact_b_id, contact_a_id];

  const { data, error } = await supabase
    .from("crm_contact_relationships")
    .insert({
      contact_a_id: normalA,
      contact_b_id: normalB,
      relationship_type,
      label: label ?? null,
      notes: notes ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { id, relationship_type, label, notes } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (relationship_type !== undefined) updates.relationship_type = relationship_type;
  if (label !== undefined) updates.label = label;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from("crm_contact_relationships")
    .update(updates)
    .eq("id", id)
    .eq("created_by", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_contact_relationships")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, source: "supabase" });
}
