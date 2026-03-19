import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: fields, error } = await supabase
    .from("crm_deal_fields")
    .select("*")
    .order("position");

  if (error) {
    console.error("[api/pipeline/fields] error:", error);
    return NextResponse.json({ error: "Failed to fetch fields" }, { status: 500 });
  }

  return NextResponse.json({ fields: fields ?? [] });
}

// Bulk update fields
export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { fields } = await request.json();

  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: "fields must be an array" }, { status: 400 });
  }

  // Get existing
  const { data: existing } = await supabase
    .from("crm_deal_fields")
    .select("id");

  const existingIds = new Set((existing ?? []).map((f) => f.id));
  const incomingIds = new Set(fields.filter((f: { id?: string }) => f.id).map((f: { id: string }) => f.id));

  // Delete removed fields
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from("crm_deal_field_values").delete().in("field_id", toDelete);
    await supabase.from("crm_deal_fields").delete().in("id", toDelete);
  }

  // Process each field
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const data = {
      field_name: f.field_name,
      label: f.label,
      field_type: f.field_type,
      options: f.options || null,
      required: f.required || false,
      board_type: f.board_type || null,
      position: i + 1,
    };

    if (f.id && existingIds.has(f.id)) {
      await supabase.from("crm_deal_fields").update(data).eq("id", f.id);
    } else {
      await supabase.from("crm_deal_fields").insert(data);
    }
  }

  // Return fresh list
  const { data: updated } = await supabase
    .from("crm_deal_fields")
    .select("*")
    .order("position");

  return NextResponse.json({ fields: updated ?? [], ok: true });
}
