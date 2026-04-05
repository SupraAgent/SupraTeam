import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { logEnrichment } from "@/lib/enrichment-log";

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

  const contactId = body.contact_id as string | undefined;
  if (!contactId) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  // Fetch existing contact for change logging
  const { data: contact, error: fetchErr } = await supabase
    .from("crm_contacts")
    .select("id, telegram_username, tg_bio, tg_photo_url, enriched_at")
    .eq("id", contactId)
    .eq("created_by", user.id)
    .single();

  if (fetchErr || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const bio = (body.bio as string | null) ?? null;
  const username = (body.username as string | null) ?? null;
  const photoUrl = (body.photo_url as string | null) ?? null;
  const now = new Date().toISOString();

  // Build update payload — only include changed fields
  const updates: Record<string, unknown> = {
    enriched_at: now,
    enrichment_source: "telegram",
    updated_at: now,
  };

  if (bio !== undefined) updates.tg_bio = bio;
  if (username && username !== contact.telegram_username) {
    updates.telegram_username = username;
  }
  if (photoUrl !== undefined) updates.tg_photo_url = photoUrl;

  const { error: updateErr } = await supabase
    .from("crm_contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("created_by", user.id);

  if (updateErr) {
    console.error("[enrich-telegram] Update error:", updateErr);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }

  // Log enrichment changes
  const oldBio = contact.tg_bio ?? null;
  if (bio !== oldBio) {
    logEnrichment(supabase, {
      contact_id: contactId,
      field_name: "tg_bio",
      old_value: oldBio,
      new_value: bio,
      source: "telegram",
      created_by: user.id,
    });
  }

  const oldUsername = contact.telegram_username ?? null;
  if (username && username !== oldUsername) {
    logEnrichment(supabase, {
      contact_id: contactId,
      field_name: "telegram_username",
      old_value: oldUsername,
      new_value: username,
      source: "telegram",
      created_by: user.id,
    });
  }

  return NextResponse.json({
    ok: true,
    enrichment: {
      tg_bio: bio,
      telegram_username: username,
      tg_photo_url: photoUrl,
      enriched_at: now,
      enrichment_source: "telegram",
    },
  });
}
