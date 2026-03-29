import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramWithTracking } from "@/lib/telegram-send";

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Retry failed broadcast recipients.
 * Called from cron (after process-scheduled) or manually.
 */
export async function GET(request: Request) {
  const { verifyCron } = await import("@/lib/cron-auth");
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Find failed recipients that haven't exhausted retries
  // Only retry broadcasts that finished sending (status = 'sent' or 'failed')
  const { data: failedRecipients } = await supabase
    .from("crm_broadcast_recipients")
    .select("id, broadcast_id, tg_group_id, telegram_group_id, group_name, delivery_attempts, last_attempt_at")
    .eq("status", "failed")
    .lt("delivery_attempts", MAX_RETRY_ATTEMPTS)
    .order("last_attempt_at", { ascending: true, nullsFirst: true })
    .limit(20);

  if (!failedRecipients || failedRecipients.length === 0) {
    return NextResponse.json({ retried: 0 });
  }

  // Group by broadcast_id to fetch message content efficiently
  const broadcastIds = [...new Set(failedRecipients.map((r) => r.broadcast_id))];
  const { data: broadcasts } = await supabase
    .from("crm_broadcasts")
    .select("id, message_html, variant_b_message")
    .in("id", broadcastIds);

  const broadcastMap = new Map((broadcasts ?? []).map((b) => [b.id, b]));

  let retried = 0;
  let succeeded = 0;

  for (const recipient of failedRecipients) {
    const broadcast = broadcastMap.get(recipient.broadcast_id);
    if (!broadcast?.message_html) continue;

    const attempts = (recipient.delivery_attempts ?? 0) + 1;

    // Exponential backoff: skip if last attempt was too recent
    const backoffMs = Math.pow(2, attempts - 1) * 60_000; // 1min, 2min, 4min
    if (recipient.delivery_attempts > 0 && recipient.last_attempt_at) {
      const elapsed = Date.now() - new Date(recipient.last_attempt_at).getTime();
      if (elapsed < backoffMs) continue; // Too soon to retry
    }

    const result = await sendTelegramWithTracking({
      chatId: recipient.telegram_group_id,
      text: broadcast.message_html,
      notificationType: "broadcast",
    });

    await supabase
      .from("crm_broadcast_recipients")
      .update({
        status: result.success ? "sent" : "failed",
        tg_message_id: result.messageId ?? null,
        error: result.error ?? null,
        sent_at: result.success ? new Date().toISOString() : null,
        delivery_attempts: attempts,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", recipient.id);

    retried++;
    if (result.success) {
      succeeded++;

      // Atomic broadcast counter adjustment via RPC (no read-modify-write race)
      await supabase.rpc("adjust_broadcast_retry_counts", {
        p_broadcast_id: recipient.broadcast_id,
      });
    }
  }

  return NextResponse.json({ retried, succeeded });
}
