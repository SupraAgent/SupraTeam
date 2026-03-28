/**
 * GET    /api/webhooks — List all webhook endpoints
 * POST   /api/webhooks — Create a new webhook
 * PUT    /api/webhooks — Update a webhook
 * DELETE /api/webhooks — Delete a webhook
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { encryptToken } from "@/lib/crypto";

/** Validate webhook URL to prevent SSRF attacks */
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be HTTPS in production, allow http://localhost in dev
    const isDev = process.env.NODE_ENV === "development";
    if (parsed.protocol === "http:" && !(isDev && parsed.hostname === "localhost")) {
      return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    // Block private/internal IP ranges
    const hostname = parsed.hostname;
    const privatePatterns = [
      /^127\./,          // loopback
      /^10\./,           // Class A private
      /^192\.168\./,     // Class C private
      /^169\.254\./,     // link-local
      /^172\.(1[6-9]|2\d|3[01])\./,  // Class B private
      /^0\./,            // current network
      /^::1$/,           // IPv6 loopback
      /^fc00:/i,         // IPv6 unique local
      /^fe80:/i,         // IPv6 link-local
      /^localhost$/i,
    ];

    // In dev mode we already allowed localhost above, but block other private ranges
    if (!isDev || hostname !== "localhost") {
      for (const pattern of privatePatterns) {
        if (pattern.test(hostname)) return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

const VALID_EVENTS = [
  "deal.created", "deal.updated", "deal.stage_changed", "deal.won", "deal.lost",
  "contact.created", "contact.updated", "note.created",
  "group.message", "group.member_joined", "group.member_left",
  "broadcast.sent", "sequence.completed",
];

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: webhooks } = await supabase
    .from("crm_webhooks")
    .select("*")
    .order("created_at", { ascending: false });

  // Get recent delivery stats per webhook
  const webhookIds = (webhooks ?? []).map((w) => w.id);
  let deliveryStats: Record<string, { total: number; success: number; lastDelivery: string | null }> = {};

  if (webhookIds.length > 0) {
    const { data: deliveries } = await supabase
      .from("crm_webhook_deliveries")
      .select("webhook_id, success, created_at")
      .in("webhook_id", webhookIds)
      .order("created_at", { ascending: false })
      .limit(500);

    for (const d of deliveries ?? []) {
      if (!deliveryStats[d.webhook_id]) {
        deliveryStats[d.webhook_id] = { total: 0, success: 0, lastDelivery: null };
      }
      deliveryStats[d.webhook_id].total++;
      if (d.success) deliveryStats[d.webhook_id].success++;
      if (!deliveryStats[d.webhook_id].lastDelivery) {
        deliveryStats[d.webhook_id].lastDelivery = d.created_at;
      }
    }
  }

  const enriched = (webhooks ?? []).map((w) => ({
    ...w,
    secret: w.secret ? "••••••••" : null,
    delivery_stats: deliveryStats[w.id] ?? { total: 0, success: 0, lastDelivery: null },
  }));

  return NextResponse.json({ webhooks: enriched, validEvents: VALID_EVENTS });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { name, url, secret, events, headers } = await request.json();

  if (!name?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "name and url required" }, { status: 400 });
  }
  if (!isValidWebhookUrl(url.trim())) {
    return NextResponse.json({ error: "Invalid webhook URL. Must be HTTPS and not target private networks." }, { status: 400 });
  }
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "At least one event required" }, { status: 400 });
  }

  // Encrypt the webhook secret before storing
  const encryptedSecret = secret ? encryptToken(secret) : null;

  const { data, error } = await supabase
    .from("crm_webhooks")
    .insert({
      name: name.trim(),
      url: url.trim(),
      secret: encryptedSecret,
      events,
      headers: headers ?? {},
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ webhook: data, ok: true });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Pick only allowed fields explicitly to prevent mass assignment
  const allowed: Record<string, unknown> = {
    name: body.name,
    url: body.url,
    events: body.events,
    is_active: body.is_active,
    headers: body.headers,
  };
  // Validate URL if being updated
  if (body.url !== undefined) {
    const urlError = isValidWebhookUrl(body.url);
    if (urlError) {
      return NextResponse.json({ error: urlError }, { status: 400 });
    }
  }

  // Remove undefined values
  const updates = Object.fromEntries(
    Object.entries(allowed).filter(([_, v]) => v !== undefined)
  );

  updates.updated_at = new Date().toISOString();

  // Reset failure count if re-activating
  if (updates.is_active === true) {
    updates.failure_count = 0;
  }

  const { error } = await supabase
    .from("crm_webhooks")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_webhooks")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
