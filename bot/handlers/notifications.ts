import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { formatStageChangeMessage } from "../../lib/telegram-templates.js";
import { formatStageChangeForGroup } from "../../lib/bot-privacy.js";
import type { PrivacyLevel } from "../../lib/bot-privacy.js";
import { pushToDealAssignee } from "./push-notifications.js";

const POLL_INTERVAL_MS = 10_000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000]; // exponential-ish backoff

/**
 * Send via centralized utility with rate limiting + tracking.
 * Falls back to raw bot.api if import fails.
 */
async function sendTracked(
  bot: Bot,
  chatId: number,
  text: string,
  dealId?: string
): Promise<void> {
  try {
    const { sendTelegramWithTracking } = await import("../../lib/telegram-send");
    const result = await sendTelegramWithTracking({
      chatId,
      text,
      notificationType: "stage_change",
      dealId,
    });
    if (!result.success) throw new Error(result.error ?? "Send failed");
  } catch {
    // Fallback to bot.api if centralized util fails (e.g. missing admin client)
    await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
  }
}

export function startNotificationPoller(bot: Bot) {
  console.warn("[bot/notifications] Starting notification poller (10s interval)");

  async function poll() {
    try {
      // Find unnotified stage changes (skip rows that already hit max retries)
      const { data: changes, error } = await supabase
        .from("crm_deal_stage_history")
        .select("id, deal_id, from_stage_id, to_stage_id, changed_by, changed_at, delivery_attempts")
        .is("notified_at", null)
        .lt("delivery_attempts", MAX_RETRIES)
        .order("changed_at", { ascending: true })
        .limit(10);

      if (error) {
        console.error("[bot/notifications] poll error:", error);
        return;
      }

      if (!changes || changes.length === 0) return;

      for (const change of changes) {
        const attempts = (change.delivery_attempts ?? 0) + 1;

        try {
          await processStageChange(bot, change);

          // Mark as notified with success status
          await supabase
            .from("crm_deal_stage_history")
            .update({
              notified_at: new Date().toISOString(),
              delivery_status: "delivered",
              delivery_attempts: attempts,
            })
            .eq("id", change.id);
        } catch (err) {
          console.error(`[bot/notifications] Failed to process change ${change.id} (attempt ${attempts}/${MAX_RETRIES}):`, err);

          if (attempts >= MAX_RETRIES) {
            // Max retries exhausted — mark as failed so it doesn't block the queue
            await supabase
              .from("crm_deal_stage_history")
              .update({
                notified_at: new Date().toISOString(),
                delivery_status: "failed",
                delivery_attempts: attempts,
              })
              .eq("id", change.id);
            console.error(`[bot/notifications] Giving up on change ${change.id} after ${MAX_RETRIES} attempts`);
          } else {
            // Record the attempt count but leave notified_at null for retry
            await supabase
              .from("crm_deal_stage_history")
              .update({ delivery_attempts: attempts })
              .eq("id", change.id);

            // Wait before processing the next change (backoff)
            const delay = RETRY_DELAYS_MS[attempts - 1] ?? 9_000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    } catch (err) {
      console.error("[bot/notifications] Unexpected error:", err);
    }
  }

  setInterval(poll, POLL_INTERVAL_MS);
  // Initial poll after 2 seconds
  setTimeout(poll, 2000);
}

async function processStageChange(
  bot: Bot,
  change: {
    id: string;
    deal_id: string;
    from_stage_id: string | null;
    to_stage_id: string | null;
    changed_by: string | null;
    changed_at: string;
  }
) {
  // Fetch the deal
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("deal_name, board_type, telegram_chat_id, tg_group_id")
    .eq("id", change.deal_id)
    .single();

  if (!deal || !deal.telegram_chat_id) return;

  // Fetch group privacy level — default to 'minimal' if group not found (safest)
  let privacyLevel: PrivacyLevel = "minimal";
  if (deal.tg_group_id) {
    const { data: group } = await supabase
      .from("tg_groups")
      .select("privacy_level")
      .eq("id", deal.tg_group_id)
      .single();
    if (group?.privacy_level) privacyLevel = group.privacy_level as PrivacyLevel;
  }
  // If no tg_group_id, try looking up by telegram_chat_id
  if (!deal.tg_group_id && deal.telegram_chat_id) {
    const { data: group } = await supabase
      .from("tg_groups")
      .select("privacy_level")
      .eq("telegram_group_id", deal.telegram_chat_id)
      .single();
    if (group?.privacy_level) privacyLevel = group.privacy_level as PrivacyLevel;
  }

  // Fetch stage names
  const [fromRes, toRes] = await Promise.all([
    change.from_stage_id
      ? supabase.from("pipeline_stages").select("name").eq("id", change.from_stage_id).single()
      : Promise.resolve({ data: null }),
    change.to_stage_id
      ? supabase.from("pipeline_stages").select("name").eq("id", change.to_stage_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const fromName = fromRes.data?.name ?? "None";
  const toName = toRes.data?.name ?? "None";

  // Fetch who made the change
  let changedByName = "Unknown";
  if (change.changed_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", change.changed_by)
      .single();
    if (profile?.display_name) changedByName = profile.display_name;
  }

  // Use privacy-aware formatting (with proper HTML escaping)
  const message = privacyLevel === "full"
    ? formatStageChangeMessage(deal.deal_name, fromName, toName, deal.board_type ?? "Unknown", changedByName)
    : formatStageChangeForGroup(deal.deal_name, fromName, toName, deal.board_type ?? "Unknown", changedByName, privacyLevel);

  await sendTracked(bot, deal.telegram_chat_id, message, change.deal_id);
  console.warn(`[bot/notifications] Sent notification (privacy=${privacyLevel}) to chat ${deal.telegram_chat_id}`);

  // Push DM to assigned rep (non-blocking)
  pushToDealAssignee(
    bot,
    change.deal_id,
    "stage_change",
    `\u{1F4CA} ${deal.deal_name} moved to ${toName}`,
    `${fromName} \u2192 ${toName} (${deal.board_type ?? "Unknown"}) by ${changedByName}`
  ).catch((err) => console.error("[bot/notifications] push error:", err));
}
