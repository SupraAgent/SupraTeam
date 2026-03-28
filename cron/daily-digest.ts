/**
 * Railway cron job: Send daily pipeline digest to Telegram groups.
 * Schedule: 0 9 * * 1-5 (weekdays 9am UTC)
 * Runs as standalone process, exits when done.
 *
 * ISOLATION: Each group only sees deals linked to that group.
 * Privacy levels control detail (full/limited/minimal).
 */
import { createClient } from "@supabase/supabase-js";
import {
  escapeHtml,
  formatDailyDigest,
  type DailyDigestStats,
} from "../lib/telegram-templates";
import { shouldShowTopDeals, shouldShowValues } from "../lib/bot-privacy";
import type { PrivacyLevel } from "../lib/bot-privacy";

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

interface TgGroup {
  id: string;
  telegram_group_id: number;
  group_name: string;
  privacy_level: PrivacyLevel;
}

async function buildGroupDigest(group: TgGroup): Promise<string | null> {
  const privacy = group.privacy_level ?? "full";

  // Fetch deals linked to THIS group only
  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, stage_id, pipeline_stages(name, position)")
    .or(`tg_group_id.eq.${group.id},telegram_chat_id.eq.${group.telegram_group_id}`)
    .order("value", { ascending: false, nullsFirst: false });

  if (!deals || deals.length === 0) {
    // No deals linked to this group — send minimal message or skip
    if (privacy === "minimal") return null;
    return `<b>📊 Daily Pipeline Digest</b>\n\nNo active deals linked to this group.`;
  }

  // Stage moves in last 24h for THIS group's deals only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dealIds = deals.map((d: any) => d.id);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentMoves } = await supabase
    .from("crm_deal_stage_history")
    .select("id")
    .in("deal_id", dealIds)
    .gte("changed_at", since);

  const movesToday = recentMoves?.length ?? 0;

  // Build stats scoped to this group
  const byBoard: Record<string, number> = {};
  const stageMap: Record<string, { name: string; position: number; count: number }> = {};

  for (const deal of deals) {
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

  // Top deals — only for full privacy groups
  const topDeals = shouldShowTopDeals(privacy)
    ? deals
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((d: any) => d.value != null)
        .slice(0, 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((d: any) => {
          const stage = d.pipeline_stages as unknown as { name: string } | null;
          return {
            name: d.deal_name,
            board: d.board_type ?? "Unknown",
            stage: stage?.name ?? "Unknown",
            value: shouldShowValues(privacy) ? (d.value as number) : undefined,
          };
        })
    : [];

  const stats: DailyDigestStats = {
    totalDeals: deals.length,
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

  return formatDailyDigest(stats, digestTpl?.body_template ?? undefined);
}

async function main() {
  console.log("[daily-digest] Starting (group-scoped)...");

  // Get groups where bot is admin, with privacy level
  const { data: groups, error: groupsErr } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name, privacy_level")
    .eq("bot_is_admin", true);

  if (groupsErr) {
    console.error("[daily-digest] Error fetching groups:", groupsErr);
    process.exit(1);
  }

  if (!groups || groups.length === 0) {
    console.log("[daily-digest] No groups to send to");
    process.exit(0);
  }

  let sent = 0;
  for (const group of groups as TgGroup[]) {
    try {
      const message = await buildGroupDigest(group);
      if (!message) {
        console.log(`[daily-digest] Skipping ${group.group_name} (no content)`);
        continue;
      }
      await sendTelegramMessage(group.telegram_group_id, message);
      sent++;
    } catch (err) {
      console.error(`[daily-digest] Failed for ${group.group_name}:`, err);
    }
  }

  console.log(`[daily-digest] Sent to ${sent}/${groups.length} groups`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[daily-digest] Fatal error:", err);
  process.exit(1);
});
