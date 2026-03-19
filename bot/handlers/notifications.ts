import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { formatStageChangeMessage } from "../../lib/telegram-templates.js";

const POLL_INTERVAL_MS = 10_000; // 10 seconds

export function startNotificationPoller(bot: Bot) {
  console.log("[bot/notifications] Starting notification poller (10s interval)");

  async function poll() {
    try {
      // Find unnotified stage changes
      const { data: changes, error } = await supabase
        .from("crm_deal_stage_history")
        .select("id, deal_id, from_stage_id, to_stage_id, changed_by, changed_at")
        .is("notified_at", null)
        .order("changed_at", { ascending: true })
        .limit(10);

      if (error) {
        console.error("[bot/notifications] poll error:", error);
        return;
      }

      if (!changes || changes.length === 0) return;

      for (const change of changes) {
        try {
          await processStageChange(bot, change);
        } catch (err) {
          console.error(`[bot/notifications] Failed to process change ${change.id}:`, err);
        }

        // Mark as notified regardless (avoid retrying forever)
        await supabase
          .from("crm_deal_stage_history")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", change.id);
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
    .select("deal_name, board_type, telegram_chat_id")
    .eq("id", change.deal_id)
    .single();

  if (!deal || !deal.telegram_chat_id) return;

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

  const message = formatStageChangeMessage(
    deal.deal_name,
    fromName,
    toName,
    deal.board_type ?? "Unknown",
    changedByName
  );

  await bot.api.sendMessage(deal.telegram_chat_id, message, { parse_mode: "HTML" });
  console.log(`[bot/notifications] Sent notification for deal "${deal.deal_name}" to chat ${deal.telegram_chat_id}`);
}
