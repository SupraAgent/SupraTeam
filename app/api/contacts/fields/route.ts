import { NextResponse } from "next/server";
import { requireAuth, requireLeadRole } from "@/lib/auth-guard";
import { listFields, bulkUpdateFields } from "@/lib/custom-fields";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { fields, error } = await listFields(supabase, "crm_contact_fields");
  if (error) {
    return NextResponse.json({ error: "Failed to fetch fields" }, { status: 500 });
  }
  return NextResponse.json({ fields });
}

export async function PUT(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { fields } = await request.json();
  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: "fields must be an array" }, { status: 400 });
  }

  const result = await bulkUpdateFields({
    supabase,
    fieldsTable: "crm_contact_fields",
    valuesTable: "crm_contact_field_values",
    fields,
  });

  return NextResponse.json({ fields: result.fields, ok: true });
}
