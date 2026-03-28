import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const CONTACT_FIELDS = ["name", "email", "phone", "telegram_username", "telegram_user_id", "company", "title", "notes", "stage_id", "tg_group_link", "lifecycle_stage", "source", "quality_score", "x_handle", "wallet_address", "wallet_chain", "on_chain_score"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { id } = await params;

  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .select("*, stage:pipeline_stages(*)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Fetch custom field values
  const { data: fieldValues } = await supabase
    .from("crm_contact_field_values")
    .select("field_id, value")
    .eq("contact_id", id);

  const custom_fields: Record<string, string> = {};
  for (const fv of fieldValues ?? []) {
    custom_fields[fv.field_id] = fv.value;
  }

  return NextResponse.json({ contact, custom_fields });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { id } = await params;

  const raw = await request.json();
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of CONTACT_FIELDS) {
    if (key in raw) body[key] = raw[key];
  }
  // Track lifecycle stage change timestamp
  if ("lifecycle_stage" in raw) {
    body.lifecycle_changed_at = new Date().toISOString();
  }

  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .update(body)
    .eq("id", id)
    .select("*, stage:pipeline_stages(*)")
    .single();

  if (error) {
    console.error("[api/contacts/[id]] update error:", error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }

  // Save custom field values
  if (raw.custom_fields && typeof raw.custom_fields === "object") {
    for (const [fieldId, val] of Object.entries(raw.custom_fields)) {
      if (val === null || val === "") {
        await supabase.from("crm_contact_field_values").delete().eq("contact_id", id).eq("field_id", fieldId);
      } else {
        await supabase.from("crm_contact_field_values").upsert(
          { contact_id: id, field_id: fieldId, value: String(val) },
          { onConflict: "contact_id,field_id" }
        );
      }
    }
  }

  return NextResponse.json({ contact, ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { id } = await params;

  const { error } = await supabase.from("crm_contacts").delete().eq("id", id);

  if (error) {
    console.error("[api/contacts/[id]] delete error:", error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
