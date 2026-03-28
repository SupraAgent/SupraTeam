/**
 * GET  /api/groups/fields — List group custom field definitions + values for a group
 * PUT  /api/groups/fields — Bulk update field definitions (admin)
 * POST /api/groups/fields — Save field values for a specific group
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");

  const { data: fields } = await supabase
    .from("crm_group_fields")
    .select("*")
    .order("position");

  let values: Record<string, string> = {};
  if (groupId) {
    const { data: fieldValues } = await supabase
      .from("crm_group_field_values")
      .select("field_id, value")
      .eq("group_id", groupId);

    for (const fv of fieldValues ?? []) {
      values[fv.field_id] = fv.value ?? "";
    }
  }

  return NextResponse.json({ fields: fields ?? [], values });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { fields } = await request.json();
  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: "fields must be an array" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("crm_group_fields")
    .select("id");

  const existingIds = new Set((existing ?? []).map((f) => f.id));
  const incomingIds = new Set(fields.filter((f: { id?: string }) => f.id).map((f: { id: string }) => f.id));

  // Delete removed
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from("crm_group_field_values").delete().in("field_id", toDelete);
    await supabase.from("crm_group_fields").delete().in("id", toDelete);
  }

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const data = {
      field_name: f.field_name,
      label: f.label,
      field_type: f.field_type,
      options: f.options || null,
      required: f.required || false,
      position: i + 1,
    };

    if (f.id && existingIds.has(f.id)) {
      await supabase.from("crm_group_fields").update(data).eq("id", f.id);
    } else {
      await supabase.from("crm_group_fields").insert(data);
    }
  }

  const { data: updated } = await supabase
    .from("crm_group_fields")
    .select("*")
    .order("position");

  return NextResponse.json({ fields: updated ?? [], ok: true });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { group_id, values } = await request.json();
  if (!group_id || !values || typeof values !== "object") {
    return NextResponse.json({ error: "group_id and values required" }, { status: 400 });
  }

  const entries = Object.entries(values as Record<string, string>);
  for (const [fieldId, value] of entries) {
    await supabase
      .from("crm_group_field_values")
      .upsert({
        group_id,
        field_id: fieldId,
        value: value || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "group_id,field_id" });
  }

  return NextResponse.json({ ok: true });
}
