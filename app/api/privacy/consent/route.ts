/**
 * GET  /api/privacy/consent?contact_id=... — Get consent records for a contact
 * POST /api/privacy/consent — Record or update consent
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contact_id");
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const { data: records } = await supabase
    .from("crm_consent_records")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ records: records ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { contact_id, consent_type, granted, source, notes } = await request.json();

  if (!contact_id || !consent_type) {
    return NextResponse.json({ error: "contact_id and consent_type required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_consent_records")
    .insert({
      contact_id,
      consent_type,
      granted: granted ?? false,
      granted_at: granted ? new Date().toISOString() : null,
      revoked_at: !granted ? new Date().toISOString() : null,
      source: source || "manual",
      notes: notes || null,
      recorded_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data, ok: true });
}
