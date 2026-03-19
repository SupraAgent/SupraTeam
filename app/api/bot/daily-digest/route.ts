import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { formatDailyDigest, type DailyDigestStats } from "@/lib/telegram-templates";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}

// Called by Vercel cron or external scheduler
export async function GET(request: Request) {
  const { verifyCron } = await import("@/lib/cron-auth");
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  const supabase = createSupabaseAdmin();
  if (!supabase || !BOT_TOKEN) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // 1. Get all deals joined with their pipeline stage
  const { data: deals, error: dealsErr } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, stage_id, pipeline_stages(name, position)")
    .order("value", { ascending: false, nullsFirst: false });

  if (dealsErr) {
    console.error("[daily-digest] Error fetching deals:", dealsErr);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }

  // 2. Get stage moves in last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentMoves, error: movesErr } = await supabase
    .from("crm_deal_stage_history")
    .select("id")
    .gte("changed_at", since);

  if (movesErr) {
    console.error("[daily-digest] Error fetching moves:", movesErr);
  }

  const movesToday = recentMoves?.length ?? 0;

  // 3. Build stats
  const byBoard: Record<string, number> = {};
  const stageMap: Record<string, { name: string; position: number; count: number }> = {};

  for (const deal of deals ?? []) {
    // Count by board
    const board = deal.board_type ?? "Unknown";
    byBoard[board] = (byBoard[board] ?? 0) + 1;

    // Count by stage
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

  // Top 5 deals by value
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

  // Load custom template if available
  const { data: digestTpl } = await supabase
    .from("crm_bot_templates")
    .select("body_template")
    .eq("template_key", "daily_digest")
    .eq("is_active", true)
    .single();

  const message = formatDailyDigest(stats, digestTpl?.body_template ?? undefined);

  // 4. Get destination groups where bot is admin
  //    Optional: filter by slug via ?slug=xyz query param
  const url = new URL(request.url);
  const slugFilter = url.searchParams.get("slug");

  let groupQuery = supabase
    .from("tg_groups")
    .select("telegram_group_id")
    .eq("bot_is_admin", true);

  if (slugFilter) {
    // Only send to groups with this slug tag
    const { data: slugGroups } = await supabase
      .from("tg_group_slugs")
      .select("group_id")
      .eq("slug", slugFilter);
    const groupIds = (slugGroups ?? []).map((sg) => sg.group_id);
    if (groupIds.length === 0) {
      return NextResponse.json({ sent: 0, groups: 0, slug: slugFilter });
    }
    groupQuery = groupQuery.in("id", groupIds);
  }

  const { data: groups, error: groupsErr } = await groupQuery;

  if (groupsErr) {
    console.error("[daily-digest] Error fetching groups:", groupsErr);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }

  if (!groups || groups.length === 0) {
    return NextResponse.json({ sent: 0, groups: 0 });
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

  return NextResponse.json({ sent, groups: groups.length });
}
