import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { formatBroadcastMessage } from "@/lib/telegram-templates";
import { sendTelegramWithTracking, sendTelegramMediaWithTracking } from "@/lib/telegram-send";

/**
 * Process scheduled broadcasts that are due.
 * Called from cron or manually.
 */
export async function GET(request: Request) {
  const { verifyCron } = await import("@/lib/cron-auth");
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  const supabase = createSupabaseAdmin();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!supabase || !botToken) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Find scheduled broadcasts that are due
  const { data: due } = await supabase
    .from("crm_broadcasts")
    .select("id, message_html, variant_b_message, media_type, media_file_id, inline_buttons, variant_b_media_file_id, sender_name")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(5);

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (const broadcast of due) {
    // Mark as sending
    await supabase
      .from("crm_broadcasts")
      .update({ status: "sending" })
      .eq("id", broadcast.id);

    // Get pending recipients (including variant assignment)
    const { data: recipients } = await supabase
      .from("crm_broadcast_recipients")
      .select("id, tg_group_id, telegram_group_id, group_name, variant")
      .eq("broadcast_id", broadcast.id)
      .eq("status", "pending");

    // Format variant B message if present
    const hasVariantB = broadcast.variant_b_message?.trim();
    const formattedVariantB = hasVariantB
      ? formatBroadcastMessage(broadcast.variant_b_message.trim(), broadcast.sender_name ?? undefined)
      : null;

    // Build inline keyboard if buttons provided
    const replyMarkup = broadcast.inline_buttons?.length
      ? { inline_keyboard: [broadcast.inline_buttons.map((b: { text: string; url: string }) => ({ text: b.text, url: b.url }))] }
      : undefined;

    let sent = 0;
    let failed = 0;

    for (const r of recipients ?? []) {
      // Select correct message and media based on A/B variant
      const msgToSend = (r.variant === "B" && formattedVariantB) ? formattedVariantB : broadcast.message_html;
      const fileId = (r.variant === "B" && broadcast.variant_b_media_file_id) ? broadcast.variant_b_media_file_id : broadcast.media_file_id;

      let result;
      if (broadcast.media_type && fileId) {
        result = await sendTelegramMediaWithTracking({
          chatId: r.telegram_group_id,
          mediaType: broadcast.media_type,
          fileId,
          caption: msgToSend,
          notificationType: "broadcast",
          replyMarkup,
        });
      } else {
        result = await sendTelegramWithTracking({
          chatId: r.telegram_group_id,
          text: msgToSend,
          notificationType: "broadcast",
          replyMarkup,
        });
      }

      await supabase
        .from("crm_broadcast_recipients")
        .update({
          status: result.success ? "sent" : "failed",
          tg_message_id: result.messageId ?? null,
          error: result.error ?? null,
          sent_at: result.success ? new Date().toISOString() : null,
        })
        .eq("id", r.id);

      if (result.success) sent++;
      else failed++;
    }

    await supabase
      .from("crm_broadcasts")
      .update({
        sent_count: sent,
        failed_count: failed,
        status: failed === (recipients?.length ?? 0) ? "failed" : "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);

    processed++;
  }

  return NextResponse.json({ processed });
}
