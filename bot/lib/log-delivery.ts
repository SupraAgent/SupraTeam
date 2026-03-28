import { supabase } from "./supabase.js";

/** Non-blocking delivery log to crm_notification_log */
export async function logDelivery(
  chatId: number,
  text: string,
  type: string,
  success: boolean,
  error?: string
): Promise<void> {
  try {
    await supabase.from("crm_notification_log").insert({
      notification_type: type,
      tg_chat_id: chatId,
      message_preview: text.length > 200 ? text.slice(0, 200) + "..." : text,
      status: success ? "sent" : "failed",
      last_error: error ?? null,
      sent_at: success ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error("[log-delivery] Failed to log delivery:", err);
  }
}
