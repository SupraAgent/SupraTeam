import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { logEnrichment } from "@/lib/enrichment-log";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const token = process.env.X_API_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "X_API_BEARER_TOKEN not configured — enter manually" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const contactId: string | undefined = body.contact_id;
  if (!contactId) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  // Fetch contact
  const { data: contact, error: fetchErr } = await supabase
    .from("crm_contacts")
    .select("id, x_handle, x_bio, x_followers, enriched_at")
    .eq("id", contactId)
    .single();

  if (fetchErr || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const handle = (body.x_handle as string) || contact.x_handle;
  if (!handle) {
    return NextResponse.json({ error: "No X handle set on this contact" }, { status: 400 });
  }

  // Fetch from Twitter API v2
  const cleanHandle = handle.replace(/^@/, "");
  const apiUrl = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(cleanHandle)}?user.fields=description,public_metrics,created_at`;

  let apiRes: Response;
  try {
    apiRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[enrich-x] Network error:", err);
    return NextResponse.json({ error: "Failed to reach X API" }, { status: 502 });
  }

  if (apiRes.status === 429) {
    return NextResponse.json(
      { error: "X API rate limit reached — try again later" },
      { status: 429 }
    );
  }

  if (!apiRes.ok) {
    return NextResponse.json(
      { error: `X API returned ${apiRes.status}` },
      { status: 502 }
    );
  }

  const apiData = await apiRes.json();
  const xUser = apiData.data;
  if (!xUser) {
    return NextResponse.json({ error: "X user not found" }, { status: 404 });
  }

  const xBio: string | null = xUser.description || null;
  const xFollowers: number = xUser.public_metrics?.followers_count ?? 0;
  const now = new Date().toISOString();

  // Build update
  const updates: Record<string, unknown> = {
    x_bio: xBio,
    x_followers: xFollowers,
    enriched_at: now,
    enrichment_source: "x_api",
    updated_at: now,
  };

  // If handle was provided in request body, update it too
  if (body.x_handle && body.x_handle !== contact.x_handle) {
    updates.x_handle = cleanHandle;
  }

  const { error: updateErr } = await supabase
    .from("crm_contacts")
    .update(updates)
    .eq("id", contactId);

  if (updateErr) {
    console.error("[enrich-x] Update error:", updateErr);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }

  // Log enrichment changes
  const oldBio = contact.x_bio ?? null;
  const oldFollowers = contact.x_followers != null ? String(contact.x_followers) : null;

  if (xBio !== oldBio) {
    logEnrichment(supabase, {
      contact_id: contactId,
      field_name: "x_bio",
      old_value: oldBio,
      new_value: xBio,
      source: "x_api",
      created_by: user.id,
    });
  }
  if (String(xFollowers) !== oldFollowers) {
    logEnrichment(supabase, {
      contact_id: contactId,
      field_name: "x_followers",
      old_value: oldFollowers,
      new_value: String(xFollowers),
      source: "x_api",
      created_by: user.id,
    });
  }

  return NextResponse.json({
    ok: true,
    enrichment: {
      x_bio: xBio,
      x_followers: xFollowers,
      enriched_at: now,
      enrichment_source: "x_api",
    },
  });
}
