import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * Bot-only endpoint for capturing leads from QR code scans.
 * Authenticated via x-bot-secret header matching TELEGRAM_BOT_TOKEN.
 *
 * POST { short_code, telegram_user_id, first_name, last_name?, username? }
 */
export async function POST(request: Request) {
  // Validate bot secret
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const secret = request.headers.get("x-bot-secret");
  if (!secret) {
    return NextResponse.json({ error: "Missing x-bot-secret header" }, { status: 401 });
  }

  // Timing-safe comparison to prevent timing attacks
  const secretBuf = Buffer.from(secret);
  const tokenBuf = Buffer.from(botToken);
  if (secretBuf.length !== tokenBuf.length || !timingSafeEqual(secretBuf, tokenBuf)) {
    return NextResponse.json({ error: "Invalid bot secret" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { short_code, telegram_user_id, first_name, last_name, username } = body;

  if (!short_code || typeof short_code !== "string") {
    return NextResponse.json({ error: "short_code is required" }, { status: 400 });
  }
  if (!telegram_user_id || (typeof telegram_user_id !== "string" && typeof telegram_user_id !== "number")) {
    return NextResponse.json({ error: "telegram_user_id is required" }, { status: 400 });
  }
  if (!first_name || typeof first_name !== "string") {
    return NextResponse.json({ error: "first_name is required" }, { status: 400 });
  }

  // Look up QR code by short_code
  const { data: qrCode, error: qrError } = await admin
    .from("crm_qr_codes")
    .select("id, stage_id, board_type, created_by")
    .eq("short_code", short_code)
    .single();

  if (qrError || !qrCode) {
    return NextResponse.json({ error: "QR code not found" }, { status: 404 });
  }

  const tgUserId = String(telegram_user_id);
  const displayName = last_name ? `${first_name} ${last_name}` : (first_name as string);

  // Find or create contact by telegram_user_id
  const { data: existingContact } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("telegram_user_id", tgUserId)
    .single();

  let contactId: string;

  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const { data: newContact, error: contactError } = await admin
      .from("crm_contacts")
      .insert({
        name: displayName,
        telegram_user_id: tgUserId,
        telegram_username: username ? String(username) : null,
        source: "qr_code",
        created_by: qrCode.created_by,
      })
      .select("id")
      .single();

    if (contactError || !newContact) {
      console.error("[api/qr-codes/capture] contact insert error:", contactError);
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
    }
    contactId = newContact.id;
  }

  // Create deal linked to the contact in the QR code's configured stage
  const { data: deal, error: dealError } = await admin
    .from("crm_deals")
    .insert({
      deal_name: `QR Lead: ${displayName}`,
      board_type: qrCode.board_type,
      stage_id: qrCode.stage_id,
      contact_id: contactId,
      created_by: qrCode.created_by,
      stage_changed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    console.error("[api/qr-codes/capture] deal insert error:", dealError);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  // Atomic counter increment to avoid race conditions under concurrent scans
  try {
    await admin.rpc("increment_qr_counters", {
      qr_id: qrCode.id,
      scan_inc: 1,
      lead_inc: 1,
    });
  } catch {
    // Fallback: non-atomic update if RPC doesn't exist yet
    await admin.from("crm_qr_codes")
      .update({
        scan_count: ((qrCode as Record<string, unknown>).scan_count as number ?? 0) + 1,
        lead_count: ((qrCode as Record<string, unknown>).lead_count as number ?? 0) + 1,
      })
      .eq("id", qrCode.id);
  }

  return NextResponse.json({
    data: { contact_id: contactId, deal_id: deal.id },
    source: "supabase",
  });
}
