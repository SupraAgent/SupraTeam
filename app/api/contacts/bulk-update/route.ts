import { NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";

export async function PATCH(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { ids, updates } = await request.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }

  const ALLOWED = ["lifecycle_stage", "stage_id", "source", "company_id"];
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED) {
    if (key in updates) body[key] = updates[key];
  }
  if ("lifecycle_stage" in updates) {
    body.lifecycle_changed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("crm_contacts")
    .update(body)
    .in("id", ids);

  if (error) {
    console.error("[bulk-update] error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: ids.length });
}
