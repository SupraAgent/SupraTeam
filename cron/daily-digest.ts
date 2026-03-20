/**
 * Railway cron job: Send daily pipeline digest to all Telegram groups.
 * Schedule: 0 9 * * 1-5 (weekdays 9am UTC)
 * Runs as standalone process, exits when done.
 */
import { createClient } from "@supabase/supabase-js";
import {
  escapeHtml,
  renderTemplate,
  formatDailyDigest,
  type DailyDigestStats,
} from "../lib/telegram-templates";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[daily-digest] Missing required env vars");
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

async function main() {
  console.log("[daily-digest] Starting...");

  // 1. Get all deals with pipeline stage
  const { data: deals, error: dealsErr } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, stage_id, pipeline_stages(name, position)")
    .order("value", { ascending: false, nullsFirst: false });

  if (dealsErr) {
    console.error("[daily-digest] Error fetching deals:", dealsErr);
    process.exit(1);
  }

  // 2. Get stage moves in last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentMoves } = await supabase
    .from("crm_deal_stage_history")
    .select("id")
    .gte("changed_at", since);

  const movesToday = recentMoves?.length ?? 0;

  // 3. Build stats
  const byBoard: Record<string, number> = {};
  const stageMap: Record<string, { name: string; position: number; count: number }> = {};

  for (const deal of deals ?? []) {
    const board = deal.board_type ?? "Unknown";
    byBoard[board] = (byBoard[board] ?? 0) + 1;

    const stage = deal.pipeline_stages as unknown as { name: string; position: number } | null;
    if (stage) {
      if (!stageMap[stage.name]) {
        stageMap[stage.name] = { name: stage.name, position: stage.position, count: 0 };
      }
      stageMap[stage.name].count++;
    }
  }

  const byStage = Object.values(stageMap)
    .sort((a, b) => a.position - b.position)
    .map(({ name, count }) => ({ name, count }));

  const topDeals = (deals ?? [])
    .filter((d) => d.value != null)
    .slice(0, 5)
    .map((d) => {
      const stage = d.pipeline_stages as unknown as { name: string } | null;
      return {
        name: d.deal_name,
        board: d.board_type ?? "Unknown",
        stage: stage?.name ?? "Unknown",
        value: d.value as number,
      };
    });

  const stats: DailyDigestStats = {
    totalDeals: deals?.length ?? 0,
    byBoard,
    byStage,
    movesToday,
    topDeals,
  };

  // Load custom template
  const { data: digestTpl } = await supabase
    .from("crm_bot_templates")
    .select("body_template")
    .eq("template_key", "daily_digest")
    .eq("is_active", true)
    .single();

  const message = formatDailyDigest(stats, digestTpl?.body_template ?? undefined);

  // 4. Get groups where bot is admin
  const { data: groups, error: groupsErr } = await supabase
    .from("tg_groups")
    .select("telegram_group_id")
    .eq("bot_is_admin", true);

  if (groupsErr) {
    console.error("[daily-digest] Error fetching groups:", groupsErr);
    process.exit(1);
  }

  if (!groups || groups.length === 0) {
    console.log("[daily-digest] No groups to send to");
    process.exit(0);
  }

  // 5. Send digest to each group
  let sent = 0;
  for (const group of groups) {
    try {
      await sendTelegramMessage(group.telegram_group_id, message);
      sent++;
    } catch (err) {
      console.error(`[daily-digest] Failed to send to ${group.telegram_group_id}:`, err);
    }
  }

  console.log(`[daily-digest] Sent to ${sent}/${groups.length} groups`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[daily-digest] Fatal error:", err);
  process.exit(1);
});
