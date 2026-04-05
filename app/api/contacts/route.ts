import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { dispatchWebhook } from "@/lib/webhooks";
import { computeQualityScore } from "@/lib/quality-score";
import { sanitizePostgrestValue } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const stageFilter = searchParams.get("stage");
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  // Use scoped client — RLS filters to contacts the user created or is a lead
  let query = supabase
    .from("crm_contacts")
    .select("*, stage:pipeline_stages(*)", { count: "exact" })
    .order("name");

  if (search) {
    const sanitized = sanitizePostgrestValue(search);
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,company.ilike.%${sanitized}%,telegram_username.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
    }
  }

  if (stageFilter) {
    query = query.eq("stage_id", stageFilter);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: contacts, error, count } = await query;

  if (error) {
    console.error("[api/contacts] error:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  return NextResponse.json({ contacts: contacts ?? [], total: count ?? 0, limit, offset, source: "supabase" });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, email, phone, telegram_username, telegram_user_id, company, company_id, title, notes, stage_id, lifecycle_stage, source, x_handle, wallet_address, wallet_chain, wallets, decision_maker_level, partnership_type } = body as Record<string, unknown>;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Use scoped client — RLS INSERT policy allows any authenticated user
  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      telegram_username: telegram_username || null,
      telegram_user_id: telegram_user_id || null,
      company: company || null,
      company_id: company_id || null,
      title: title || null,
      notes: notes || null,
      stage_id: stage_id || null,
      lifecycle_stage: lifecycle_stage || "prospect",
      source: source || "manual",
      x_handle: x_handle || null,
      wallet_address: wallet_address || null,
      wallet_chain: wallet_chain || null,
      wallets: Array.isArray(wallets) ? wallets : [],
      decision_maker_level: decision_maker_level || null,
      partnership_type: partnership_type || null,
      created_by: user.id,
    })
    .select("*, stage:pipeline_stages(*)")
    .single();

  if (error) {
    console.error("[api/contacts] insert error:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }

  // Compute and update quality_score
  if (contact) {
    const qualityScore = computeQualityScore(contact);
    await supabase
      .from("crm_contacts")
      .update({ quality_score: qualityScore })
      .eq("id", contact.id);
    contact.quality_score = qualityScore;
  }

  // Save custom field values
  if (body.custom_fields && typeof body.custom_fields === "object" && contact) {
    const fieldValues = Object.entries(body.custom_fields)
      .filter(([, v]) => v)
      .map(([fieldId, val]) => ({
        contact_id: contact.id,
        field_id: fieldId,
        value: String(val),
      }));

    if (fieldValues.length > 0) {
      await supabase.from("crm_contact_field_values").insert(fieldValues);
    }
  }

  // Fire webhook (non-blocking)
  if (contact) {
    dispatchWebhook("contact.created", { contact_id: contact.id, name: contact.name, company: contact.company, source: contact.source }).catch(() => {});
  }

  // Trigger X enrichment asynchronously if x_handle is set
  if (contact && contact.x_handle) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/contacts/enrich-x`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contact.id }),
    }).catch(() => {});
  }

  return NextResponse.json({ contact, ok: true });
}
