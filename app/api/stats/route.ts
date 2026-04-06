import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [dealsRes, contactsRes, stagesRes, historyThisWeekRes, historyLastWeekRes, notificationsRes, pinnedRes, groupsRes, tokensRes, emailRes, linkedChatsRes, linkedGroupsRes] = await Promise.all([
    supabase.from("crm_deals").select("id, deal_name, board_type, stage_id, value, probability, created_at, updated_at, stage_changed_at, telegram_chat_id, contact:crm_contacts(name, telegram_username), stage:pipeline_stages(id, name, color, position)").order("updated_at", { ascending: false }),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }),
    supabase.from("pipeline_stages").select("id, name, position, color").order("position"),
    supabase.from("crm_deal_stage_history").select("id, deal_id, from_stage_id, to_stage_id, changed_at").gte("changed_at", sevenDaysAgo),
    supabase.from("crm_deal_stage_history").select("id, deal_id, from_stage_id, to_stage_id, changed_at").gte("changed_at", fourteenDaysAgo).lt("changed_at", sevenDaysAgo),
    supabase.from("crm_notifications").select("id, type, title, body, tg_deep_link, pipeline_link, tg_sender_name, created_at, deal:crm_deals(id, deal_name, board_type, stage:pipeline_stages(name, color)), tg_group:tg_groups(group_name, telegram_group_id)").eq("type", "tg_message").gte("created_at", twentyFourHoursAgo).order("created_at", { ascending: false }),
    supabase.from("crm_deals").select("id, deal_name, board_type, value, stage:pipeline_stages(name, color)").eq("probability", 100).limit(5),
    supabase.from("tg_groups").select("id", { count: "exact", head: true }),
    supabase.from("user_tokens").select("id", { count: "exact", head: true }).eq("provider", "telegram_bot"),
    supabase.from("crm_email_connections").select("id", { count: "exact", head: true }),
    // Fetch explicit deal-chat links for hot conversation matching
    supabase.from("crm_deal_linked_chats").select("deal_id, telegram_chat_id"),
    // Fetch TG groups with activity data for cross-signal detection
    supabase.from("tg_groups").select("telegram_group_id, group_name, last_message_at, updated_at"),
  ]);

  // Check critical queries — degrade gracefully if any fail
  if (dealsRes.error || stagesRes.error) {
    console.error("[api/stats] critical query error:", dealsRes.error ?? stagesRes.error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }

  const deals = dealsRes.data ?? [];
  const totalContacts = contactsRes.count ?? 0;
  const stages = stagesRes.data ?? [];
  const historyThisWeek = historyThisWeekRes.data ?? [];
  const historyLastWeek = historyLastWeekRes.data ?? [];
  const recentMessages = notificationsRes.data ?? [];
  const pinnedDeals = pinnedRes.data ?? [];

  // --- Basic stats ---
  const byBoard = { BD: 0, Marketing: 0, Admin: 0 };
  const byStage: Record<string, number> = {};
  for (const stage of stages) byStage[stage.id] = 0;
  for (const deal of deals) {
    if (deal.board_type in byBoard) byBoard[deal.board_type as keyof typeof byBoard]++;
    if (deal.stage_id && deal.stage_id in byStage) byStage[deal.stage_id]++;
  }

  const stageBreakdown = stages.map((s) => ({
    id: s.id, name: s.name, position: s.position, color: s.color, count: byStage[s.id] ?? 0,
  }));

  // --- Deal value summary ---
  let totalPipelineValue = 0;
  let weightedPipelineValue = 0;
  const valueByBoard = { BD: 0, Marketing: 0, Admin: 0 };
  for (const deal of deals) {
    const v = Number(deal.value ?? 0);
    const p = Number(deal.probability ?? 50) / 100;
    totalPipelineValue += v;
    weightedPipelineValue += v * p;
    if (deal.board_type in valueByBoard) {
      valueByBoard[deal.board_type as keyof typeof valueByBoard] += v;
    }
  }

  // --- Stale deals (no activity in 7+ days) ---
  const staleDeals = deals
    .filter((d) => new Date(d.updated_at).getTime() < new Date(sevenDaysAgo).getTime())
    .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
    .slice(0, 5)
    .map((d) => ({
      id: d.id, deal_name: d.deal_name, board_type: d.board_type,
      value: d.value, days_stale: Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / 86400000),
      stage_name: (d.stage as unknown as { name: string } | null)?.name ?? "",
    }));

  // --- Follow-ups (deals in "Follow Up" stage with last activity > 24h) ---
  const followUpStage = stages.find((s) => s.name.toLowerCase().includes("follow"));
  const followUps = followUpStage
    ? deals
        .filter((d) => d.stage_id === followUpStage.id && new Date(d.updated_at).getTime() < new Date(twentyFourHoursAgo).getTime())
        .slice(0, 5)
        .map((d) => ({
          id: d.id, deal_name: d.deal_name, board_type: d.board_type, value: d.value,
          contact_name: (d.contact as unknown as { name: string } | null)?.name ?? null,
          hours_since: Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / 3600000),
        }))
    : [];

  // --- Pipeline velocity ---
  const movesThisWeek = historyThisWeek.length;
  const movesLastWeek = historyLastWeek.length;

  // Average days in each stage (from history)
  // Group history by deal_id and sort by changed_at to find enter/exit pairs
  const stageDurations: Record<string, number[]> = {};
  const historyByDeal = new Map<string, typeof historyThisWeek>();
  for (const h of historyThisWeek) {
    const existing = historyByDeal.get(h.deal_id);
    if (existing) existing.push(h);
    else historyByDeal.set(h.deal_id, [h]);
  }
  for (const [dealId, entries] of historyByDeal) {
    entries.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    for (let i = 0; i < entries.length; i++) {
      const h = entries[i];
      if (!h.from_stage_id || !h.changed_at) continue;
      // Enter time: previous history entry's changed_at, or deal created_at
      let enterTime: number;
      if (i > 0 && entries[i - 1].changed_at) {
        enterTime = new Date(entries[i - 1].changed_at).getTime();
      } else {
        const deal = deals.find((d) => d.id === dealId);
        enterTime = deal ? new Date(deal.created_at).getTime() : new Date(h.changed_at).getTime();
      }
      const exitTime = new Date(h.changed_at).getTime();
      const days = Math.max(0, (exitTime - enterTime) / 86400000);
      if (!stageDurations[h.from_stage_id]) stageDurations[h.from_stage_id] = [];
      stageDurations[h.from_stage_id].push(days);
    }
  }

  const avgDaysPerStage = stages.map((s) => ({
    id: s.id, name: s.name, color: s.color,
    avg_days: stageDurations[s.id]
      ? Math.round((stageDurations[s.id].reduce((a, b) => a + b, 0) / stageDurations[s.id].length) * 10) / 10
      : null,
  }));

  // --- Stage conversion rates ---
  const stageTransitions: Record<string, { from: number; to_next: number }> = {};
  for (const stage of stages) {
    stageTransitions[stage.id] = { from: 0, to_next: 0 };
  }
  for (const h of [...historyThisWeek, ...(historyLastWeekRes.data ?? [])]) {
    const hist = h as { from_stage_id: string; to_stage_id: string };
    if (hist.from_stage_id && stageTransitions[hist.from_stage_id]) {
      stageTransitions[hist.from_stage_id].from++;
    }
    if (hist.to_stage_id && hist.from_stage_id) {
      const fromStage = stages.find((s) => s.id === hist.from_stage_id);
      const toStage = stages.find((s) => s.id === hist.to_stage_id);
      if (fromStage && toStage && toStage.position === fromStage.position + 1) {
        stageTransitions[hist.from_stage_id].to_next++;
      }
    }
  }

  const conversionRates = stages.slice(0, -1).map((s) => ({
    id: s.id, name: s.name, color: s.color,
    next_stage: stages.find((ns) => ns.position === s.position + 1)?.name ?? "",
    rate: stageTransitions[s.id].from > 0
      ? Math.round((stageTransitions[s.id].to_next / stageTransitions[s.id].from) * 100)
      : null,
    total_moves: stageTransitions[s.id].from,
  }));

  // --- Hot conversations (TG groups linked to deals with most messages in 24h) ---
  // Build a set of linked telegram_chat_ids from the junction table + legacy deal.telegram_chat_id
  interface LinkedChatRow { deal_id: string; telegram_chat_id: number }
  const linkedChatRows = (linkedChatsRes.data ?? []) as LinkedChatRow[];
  const chatIdToDealIds = new Map<number, Set<string>>();
  for (const link of linkedChatRows) {
    const existing = chatIdToDealIds.get(link.telegram_chat_id);
    if (existing) {
      existing.add(link.deal_id);
    } else {
      chatIdToDealIds.set(link.telegram_chat_id, new Set([link.deal_id]));
    }
  }
  // Backward compat: also consider deals with telegram_chat_id set directly
  for (const deal of deals) {
    const legacyChatId = deal.telegram_chat_id as number | null;
    if (legacyChatId && !chatIdToDealIds.has(legacyChatId)) {
      chatIdToDealIds.set(legacyChatId, new Set([deal.id]));
    }
  }

  // Build a deal lookup by id
  const dealById = new Map(deals.map((d) => [d.id, d]));

  // Count messages per group, but only for groups linked to deals
  const groupMessageCounts: Record<string, { name: string; count: number; deal_name: string; deal_id: string }> = {};
  for (const n of recentMessages) {
    const group = n.tg_group as unknown as { group_name: string; telegram_group_id: number } | null;
    if (!group?.telegram_group_id) continue;
    const linkedDealIds = chatIdToDealIds.get(group.telegram_group_id);
    if (!linkedDealIds || linkedDealIds.size === 0) continue; // Only count groups linked to deals

    const key = group.group_name ?? "Unknown";
    if (!groupMessageCounts[key]) {
      // Pick the first linked deal for display
      const firstDealId = linkedDealIds.values().next().value as string;
      const linkedDeal = dealById.get(firstDealId);
      groupMessageCounts[key] = {
        name: key,
        count: 0,
        deal_name: linkedDeal?.deal_name ?? "",
        deal_id: firstDealId,
      };
    }
    groupMessageCounts[key].count++;
  }
  const hotConversations = Object.values(groupMessageCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // --- Cross-signal alerts: deals with linked TG groups that went quiet ---
  // Build a map of telegram_group_id -> group data for health assessment
  interface TgGroupRow { telegram_group_id: number; group_name: string; last_message_at: string | null; updated_at: string }
  const tgGroups = (linkedGroupsRes.data ?? []) as TgGroupRow[];
  const groupByChatId = new Map<number, TgGroupRow>();
  for (const g of tgGroups) {
    groupByChatId.set(g.telegram_group_id, g);
  }

  // Build deal_id -> linked chat_ids from junction table + legacy fallback
  const dealIdToLinkedChatIds = new Map<string, Set<number>>();
  for (const link of linkedChatRows) {
    const existing = dealIdToLinkedChatIds.get(link.deal_id);
    if (existing) {
      existing.add(link.telegram_chat_id);
    } else {
      dealIdToLinkedChatIds.set(link.deal_id, new Set([link.telegram_chat_id]));
    }
  }
  // Backward compat: also consider deals with telegram_chat_id set directly
  for (const deal of deals) {
    const legacyChatId = deal.telegram_chat_id as number | null;
    if (legacyChatId && !dealIdToLinkedChatIds.has(deal.id)) {
      dealIdToLinkedChatIds.set(deal.id, new Set([legacyChatId]));
    }
  }

  // Determine group health based on last_message_at
  const getGroupHealth = (g: TgGroupRow): string => {
    const lastActive = g.last_message_at ? new Date(g.last_message_at).getTime() : null;
    if (!lastActive) return "dead";
    const daysSince = (now.getTime() - lastActive) / 86400000;
    if (daysSince > 14) return "dead";
    if (daysSince > 7) return "stale";
    if (daysSince > 3) return "quiet";
    return "active";
  };

  const QUIET_HEALTH = new Set(["stale", "dead", "quiet"]);
  const activeDealIds = new Set(hotConversations.map((h) => h.deal_id));

  const crossSignals: { deal_name: string; deal_id: string; group_name: string; health: string; days_stale: number; stage_name: string }[] = [];
  for (const deal of staleDeals) {
    if (activeDealIds.has(deal.id)) continue; // has active conversation — skip
    const linkedChatIds = dealIdToLinkedChatIds.get(deal.id);
    if (!linkedChatIds || linkedChatIds.size === 0) continue;

    for (const chatId of linkedChatIds) {
      const group = groupByChatId.get(chatId);
      if (!group) continue;
      const health = getGroupHealth(group);
      if (QUIET_HEALTH.has(health)) {
        crossSignals.push({
          deal_name: deal.deal_name,
          deal_id: deal.id,
          group_name: group.group_name,
          health,
          days_stale: deal.days_stale,
          stage_name: deal.stage_name,
        });
        break; // one alert per deal is enough
      }
    }
  }

  // --- Recent deals ---
  const recentDeals = deals.slice(0, 5).map((d) => ({
    id: d.id, deal_name: d.deal_name, board_type: d.board_type,
    stage_name: (d.stage as unknown as { name: string } | null)?.name ?? "",
    value: d.value, updated_at: d.updated_at,
  }));

  return NextResponse.json({
    totalDeals: deals.length,
    totalContacts,
    byBoard,
    stageBreakdown,
    recentDeals,
    // New widgets
    totalPipelineValue,
    weightedPipelineValue,
    valueByBoard,
    staleDeals,
    followUps,
    velocity: { movesThisWeek, movesLastWeek, avgDaysPerStage },
    conversionRates,
    hotConversations,
    crossSignals,
    pinnedDeals: pinnedDeals.map((d) => ({
      id: d.id, deal_name: d.deal_name, board_type: d.board_type, value: d.value,
      stage_name: (d.stage as unknown as { name: string } | null)?.name ?? "",
      stage_color: (d.stage as unknown as { color: string } | null)?.color ?? null,
    })),
    onboarding: {
      hasBotToken: (tokensRes.count ?? 0) > 0 || !!process.env.TELEGRAM_BOT_TOKEN,
      hasGroups: (groupsRes.count ?? 0) > 0,
      hasDeals: deals.length > 0,
      hasContacts: totalContacts > 0,
      hasEmail: (emailRes.count ?? 0) > 0,
      hasLinkedChats: (linkedChatsRes.data ?? []).length > 0,
    },
  });
}
