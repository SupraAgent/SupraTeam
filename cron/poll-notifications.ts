/**
 * Railway cron job: Poll for unnotified stage changes and send Telegram messages.
 * Schedule: every 5 minutes
 * Runs as standalone process, exits when done.
 */
import { createClient } from "@supabase/supabase-js";
import {
  escapeHtml,
  renderTemplate,
} from "../lib/telegram-templates";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.supravibe.xyz";

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[poll-notifications] Missing required env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// Inline the template rendering to avoid Next.js import issues
const DEFAULT_STAGE_CHANGE = `<b>Deal Update</b>

<b>{{deal_name}}</b>
{{from_stage}} → {{to_stage}}
Board: {{board_type}}
By: {{changed_by}}`;

function formatStageChange(
  dealName: string,
  fromStage: string,
  toStage: string,
  boardType: string,
  changedBy: string,
  customTemplate?: string
): string {
  const template = customTemplate || DEFAULT_STAGE_CHANGE;
  return renderTemplate(template, {
    deal_name: dealName,
    from_stage: fromStage,
    to_stage: toStage,
    board_type: boardType,
    changed_by: changedBy,
  });
}

async function main() {
  console.log("[poll-notifications] Starting...");

  // Find unnotified stage changes
  const { data: changes, error } = await supabase
    .from("crm_deal_stage_history")
    .select("id, deal_id, from_stage_id, to_stage_id, changed_by, changed_at")
    .is("notified_at", null)
    .order("changed_at", { ascending: true })
    .limit(10);

  if (error) {
    console.error("[poll-notifications] Query error:", error);
    process.exit(1);
  }

  if (!changes || changes.length === 0) {
    console.log("[poll-notifications] No pending notifications");
  } else {
    let processed = 0;

    for (const change of changes) {
      try {
        const { data: deal } = await supabase
          .from("crm_deals")
          .select("deal_name, board_type, telegram_chat_id")
          .eq("id", change.deal_id)
          .single();

        if (deal?.telegram_chat_id) {
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

          let changedByName = "Unknown";
          if (change.changed_by) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", change.changed_by)
              .single();
            if (profile?.display_name) changedByName = profile.display_name;
          }

          const { data: tpl } = await supabase
            .from("crm_bot_templates")
            .select("body_template")
            .eq("template_key", "stage_change")
            .eq("is_active", true)
            .single();

          const message = formatStageChange(
            deal.deal_name,
            fromName,
            toName,
            deal.board_type ?? "Unknown",
            changedByName,
            tpl?.body_template ?? undefined
          );
          await sendTelegramMessage(deal.telegram_chat_id, message);
          processed++;
        }

        await supabase
          .from("crm_deal_stage_history")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", change.id);
      } catch (err) {
        console.error(`[poll-notifications] Error processing ${change.id}:`, err);
      }
    }

    console.log(`[poll-notifications] Processed ${processed} notifications`);
  }

  // Auto-generate reminders
  try {
    const reminderRes = await fetch(`${APP_URL}/api/reminders`, { method: "POST" });
    if (reminderRes.ok) {
      const data = await reminderRes.json();
      console.log(`[poll-notifications] Generated ${data.generated ?? 0} reminders`);
    }
  } catch (err) {
    console.error("[poll-notifications] Reminder generation error:", err);
  }

  console.log("[poll-notifications] Done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[poll-notifications] Fatal error:", err);
  process.exit(1);
});
