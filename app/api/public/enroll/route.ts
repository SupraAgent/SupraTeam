/**
 * POST /api/public/enroll — Public API for sequence enrollment.
 *
 * Auth: Bearer token from crm_api_keys table.
 * Body: { sequence_id, deal_id?, contact_id?, tg_chat_id? }
 *
 * Returns: { enrollment, ok: true }
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { dispatchWebhook } from "@/lib/webhooks";
import { createHmac } from "crypto";

async function validateApiKey(request: Request): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  const admin = createSupabaseAdmin();
  if (!admin) return null;

  // Hash the key to compare against stored hash
  const keyHash = createHmac("sha256", "crm-api-key-salt")
    .update(token)
    .digest("hex");

  const { data } = await admin
    .from("crm_api_keys")
    .select("id, user_id, is_active, expires_at")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  // Update last_used_at (non-blocking)
  admin
    .from("crm_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(null, () => {});

  return { userId: data.user_id as string };
}

export async function POST(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sequence_id, deal_id, contact_id, tg_chat_id } = body as {
    sequence_id?: string;
    deal_id?: string;
    contact_id?: string;
    tg_chat_id?: string | number;
  };

  if (!sequence_id) {
    return NextResponse.json({ error: "sequence_id required" }, { status: 400 });
  }
  if (!deal_id && !contact_id) {
    return NextResponse.json(
      { error: "deal_id or contact_id required" },
      { status: 400 }
    );
  }

  // Check for duplicate active enrollment
  let duplicateQuery = admin
    .from("crm_outreach_enrollments")
    .select("id")
    .eq("sequence_id", sequence_id)
    .in("status", ["active", "paused"]);

  if (deal_id) duplicateQuery = duplicateQuery.eq("deal_id", deal_id);
  if (contact_id) duplicateQuery = duplicateQuery.eq("contact_id", contact_id);

  const { data: existing } = await duplicateQuery.limit(1);
  if (existing?.length) {
    return NextResponse.json(
      { error: "Already enrolled in this sequence" },
      { status: 409 }
    );
  }

  // Get first step delay
  const { data: firstStep } = await admin
    .from("crm_outreach_steps")
    .select("delay_hours")
    .eq("sequence_id", sequence_id)
    .eq("step_number", 1)
    .single();

  const delayMs = (firstStep?.delay_hours ?? 0) * 3600000;
  const nextSendAt = new Date(Date.now() + delayMs).toISOString();

  // Resolve chat ID from deal if not provided
  let chatId = tg_chat_id;
  if (!chatId && deal_id) {
    const { data: deal } = await admin
      .from("crm_deals")
      .select("telegram_chat_id")
      .eq("id", deal_id)
      .single();
    chatId = deal?.telegram_chat_id ?? null;
  }

  const { data: enrollment, error } = await admin
    .from("crm_outreach_enrollments")
    .insert({
      sequence_id,
      deal_id: deal_id || null,
      contact_id: contact_id || null,
      tg_chat_id: chatId || null,
      current_step: 1,
      next_send_at: nextSendAt,
      enrolled_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  dispatchWebhook("sequence.enrolled", {
    enrollment_id: enrollment.id,
    sequence_id,
    deal_id: deal_id || null,
    contact_id: contact_id || null,
    tg_chat_id: chatId || null,
    enrolled_by: auth.userId,
    source: "public_api",
  });

  return NextResponse.json({ enrollment, ok: true });
}
