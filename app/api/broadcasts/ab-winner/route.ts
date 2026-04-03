import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { formatBroadcastMessage } from "@/lib/telegram-templates";
import { sendTelegramWithTracking, sendTelegramMediaWithTracking } from "@/lib/telegram-send";

/**
 * GET /api/broadcasts/ab-winner?broadcast_id=...
 * Returns A/B test results for a broadcast with winner detection.
 *
 * POST /api/broadcasts/ab-winner
 * Sends the winning variant to all groups that haven't received it yet (the "losing" variant groups).
 */

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const broadcastId = url.searchParams.get("broadcast_id");
  if (!broadcastId) {
    return NextResponse.json({ error: "broadcast_id required" }, { status: 400 });
  }

  const { data: broadcast } = await supabase
    .from("crm_broadcasts")
    .select("id, message_text, variant_b_message, status, ab_winner, ab_winner_sent_at, media_type, media_file_id, variant_b_media_file_id")
    .eq("id", broadcastId)
    .single();

  if (!broadcast) {
    return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  }

  if (!broadcast.variant_b_message) {
    return NextResponse.json({ error: "Not an A/B test broadcast" }, { status: 400 });
  }

  // Get recipient stats
  const { data: recipients } = await supabase
    .from("crm_broadcast_recipients")
    .select("variant, status, responded_at")
    .eq("broadcast_id", broadcastId);

  const stats = { a: { sent: 0, responded: 0 }, b: { sent: 0, responded: 0 } };
  for (const r of recipients ?? []) {
    if (r.status !== "sent") continue;
    if (r.variant === "B") {
      stats.b.sent++;
      if (r.responded_at) stats.b.responded++;
    } else {
      stats.a.sent++;
      if (r.responded_at) stats.a.responded++;
    }
  }

  const aRate = stats.a.sent > 0 ? stats.a.responded / stats.a.sent : 0;
  const bRate = stats.b.sent > 0 ? stats.b.responded / stats.b.sent : 0;

  // Require minimum 2 responses total and at least 3 recipients per variant to declare a winner
  const totalResponses = stats.a.responded + stats.b.responded;
  const canDeclareWinner = totalResponses >= 2 && stats.a.sent >= 3 && stats.b.sent >= 3;
  const winner = canDeclareWinner ? (aRate >= bRate ? "A" : "B") : null;

  return NextResponse.json({
    broadcast_id: broadcastId,
    variant_a: { ...stats.a, rate: Math.round(aRate * 100) },
    variant_b: { ...stats.b, rate: Math.round(bRate * 100) },
    winner,
    already_sent: !!broadcast.ab_winner_sent_at,
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const { broadcast_id, winner } = await request.json();
  if (!broadcast_id || !winner || !["A", "B"].includes(winner)) {
    return NextResponse.json({ error: "broadcast_id and winner (A or B) required" }, { status: 400 });
  }

  const { data: broadcast } = await supabase
    .from("crm_broadcasts")
    .select("id, message_text, message_html, variant_b_message, sender_name, ab_winner_sent_at, media_type, media_file_id, variant_b_media_file_id, inline_buttons")
    .eq("id", broadcast_id)
    .single();

  if (!broadcast) {
    return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  }

  if (broadcast.ab_winner_sent_at) {
    return NextResponse.json({ error: "Winner already sent" }, { status: 400 });
  }

  // Get the losing variant's recipients (they'll receive the winning message)
  const losingVariant = winner === "A" ? "B" : "A";
  const { data: losingRecipients } = await supabase
    .from("crm_broadcast_recipients")
    .select("id, tg_group_id, telegram_group_id, group_name")
    .eq("broadcast_id", broadcast_id)
    .eq("variant", losingVariant)
    .eq("status", "sent");

  if (!losingRecipients || losingRecipients.length === 0) {
    return NextResponse.json({ error: "No recipients to send to" }, { status: 400 });
  }

  // Build the winning message
  const winnerText = winner === "A" ? broadcast.message_text : broadcast.variant_b_message;
  const formattedMessage = formatBroadcastMessage(winnerText, broadcast.sender_name ?? undefined);
  const winnerFileId = winner === "A" ? broadcast.media_file_id : broadcast.variant_b_media_file_id;

  const replyMarkup = broadcast.inline_buttons?.length
    ? { inline_keyboard: [(broadcast.inline_buttons as Array<{ text: string; url: string }>).map((b) => ({ text: b.text, url: b.url }))] }
    : undefined;

  let sent = 0;
  let failed = 0;

  for (const r of losingRecipients) {
    let result;
    if (broadcast.media_type && winnerFileId) {
      result = await sendTelegramMediaWithTracking({
        chatId: r.telegram_group_id,
        mediaType: broadcast.media_type,
        fileId: winnerFileId,
        caption: formattedMessage,
        notificationType: "broadcast_ab_winner",
        replyMarkup,
      });
    } else {
      result = await sendTelegramWithTracking({
        chatId: r.telegram_group_id,
        text: formattedMessage,
        notificationType: "broadcast_ab_winner",
        replyMarkup,
      });
    }

    if (result.success) sent++;
    else failed++;
  }

  // Mark winner on the broadcast
  await supabase
    .from("crm_broadcasts")
    .update({
      ab_winner: winner,
      ab_winner_sent_at: new Date().toISOString(),
    })
    .eq("id", broadcast_id);

  return NextResponse.json({ ok: true, sent, failed, total: losingRecipients.length });
}
