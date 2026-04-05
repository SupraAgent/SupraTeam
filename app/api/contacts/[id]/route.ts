import { NextResponse } from "next/server";
import { requireAuth, requireLeadRole } from "@/lib/auth-guard";
import { logEnrichment } from "@/lib/enrichment-log";
import { computeQualityScore } from "@/lib/quality-score";

// on_chain_score excluded — only set via enrichment endpoints, not generic PATCH
const CONTACT_FIELDS = ["name", "email", "phone", "telegram_username", "telegram_user_id", "company", "company_id", "title", "notes", "stage_id", "tg_group_link", "lifecycle_stage", "source", "quality_score", "x_handle", "wallet_address", "wallet_chain", "wallets", "decision_maker_level", "partnership_type"];

const QUALITY_SCORE_FIELDS = ["name", "email", "telegram_username", "company", "phone", "title", "x_handle", "wallet_address", "on_chain_score"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .select("*, stage:pipeline_stages(*), linked_company:crm_companies(*)")
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
  const { user, supabase } = auth;
  const { id } = await params;

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of CONTACT_FIELDS) {
    if (key in raw) body[key] = raw[key];
  }
  // Track lifecycle stage change timestamp
  if ("lifecycle_stage" in raw) {
    body.lifecycle_changed_at = new Date().toISOString();
  }

  // Check if any quality-score-relevant field is being updated
  const qualityFieldChanging = QUALITY_SCORE_FIELDS.some((f) => f in raw);

  // Fetch old contact for enrichment field change logging
  const ENRICHMENT_FIELDS = ["x_handle", "wallet_address", "on_chain_score"];
  const enrichmentFieldChanging = ENRICHMENT_FIELDS.some((f) => f in raw);
  let oldContact: Record<string, unknown> | null = null;
  if (enrichmentFieldChanging) {
    const { data: old } = await supabase
      .from("crm_contacts")
      .select("x_handle, wallet_address, on_chain_score")
      .eq("id", id)
      .single();
    oldContact = old;
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

  // Recompute quality_score when relevant fields change
  if (qualityFieldChanging && contact) {
    const newScore = computeQualityScore(contact);
    await supabase.from("crm_contacts").update({ quality_score: newScore }).eq("id", id);
    contact.quality_score = newScore;
  }

  // Log enrichment field changes
  if (enrichmentFieldChanging && oldContact && contact) {
    for (const field of ENRICHMENT_FIELDS) {
      if (field in raw) {
        const oldVal = oldContact[field] != null ? String(oldContact[field]) : null;
        const newVal = raw[field] != null ? String(raw[field]) : null;
        if (oldVal !== newVal) {
          logEnrichment(supabase, {
            contact_id: id,
            field_name: field,
            old_value: oldVal,
            new_value: newVal,
            source: "manual",
            created_by: user.id,
          });
        }
      }
    }
  }

  // Trigger enrichment asynchronously when relevant fields change
  if (contact) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const cookieHeader = request.headers.get("cookie") ?? "";
    if ("x_handle" in raw && raw.x_handle) {
      fetch(`${appUrl}/api/contacts/enrich-x`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": cookieHeader },
        body: JSON.stringify({ contact_id: id, x_handle: raw.x_handle }),
      }).catch(() => {});
    }
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
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { error } = await supabase.from("crm_contacts").delete().eq("id", id);

  if (error) {
    console.error("[api/contacts/[id]] delete error:", error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
