import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { listFields, listFieldValues, bulkUpdateFields, saveFieldValues } from "@/lib/custom-fields";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");

  const { fields } = await listFields(supabase, "crm_group_fields");
  const values = groupId
    ? await listFieldValues(supabase, "crm_group_field_values", "group_id", groupId)
    : {};

  return NextResponse.json({ fields, values });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { fields } = await request.json();
  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: "fields must be an array" }, { status: 400 });
  }

  const result = await bulkUpdateFields({
    supabase,
    fieldsTable: "crm_group_fields",
    valuesTable: "crm_group_field_values",
    fields,
  });

  return NextResponse.json({ fields: result.fields, ok: true });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { group_id, values } = await request.json();
  if (!group_id || !values || typeof values !== "object") {
    return NextResponse.json({ error: "group_id and values required" }, { status: 400 });
  }

  await saveFieldValues(supabase, "crm_group_field_values", "group_id", group_id, values, "group_id,field_id");
  return NextResponse.json({ ok: true });
}
