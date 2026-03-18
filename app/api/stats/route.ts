import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [dealsRes, contactsRes, stagesRes, historyThisWeekRes, historyLastWeekRes, notificationsRes, pinnedRes] = await Promise.all([
    supabase.from("crm_deals").select("id, deal_name, board_type, stage_id, value, probability, created_at, updated_at, stage_changed_at, contact:crm_contacts(name, telegram_username), stage:pipeline_stages(id, name, color, position)").order("updated_at", { ascending: false }),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }),
    supabase.from("pipeline_stages").select("id, name, position, color").order("position"),
    supabase.from("crm_deal_stage_history").select("id, deal_id, from_stage_id, to_stage_id, changed_at").gte("changed_at", sevenDaysAgo),
    supabase.from("crm_deal_stage_history").select("id, deal_id, from_stage_id, to_stage_id, changed_at").gte("changed_at", fourteenDaysAgo).lt("changed_at", sevenDaysAgo),
    supabase.from("crm_notifications").select("id, type, title, body, tg_deep_link, pipeline_link, tg_sender_name, created_at, deal:crm_deals(id, deal_name, board_type, stage:pipeline_stages(name, color)), tg_group:tg_groups(group_name)").eq("type", "tg_message").gte("created_at", twentyFourHoursAgo).order("created_at", { ascending: false }),
    supabase.from("crm_deals").select("id, deal_name, board_type, value, stage:pipeline_stages(name, color)").eq("probability", 100).limit(5),
  ]);

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
  const stageDurations: Record<string, number[]> = {};
  for (const h of historyThisWeek) {
    if (h.from_stage_id && h.changed_at) {
      // Find deal creation or previous move
      const deal = deals.find((d) => d.id === h.deal_id);
      if (deal) {
        const enterTime = new Date(deal.stage_changed_at ?? deal.created_at).getTime();
        const exitTime = new Date(h.changed_at).getTime();
        const days = Math.max(0, (exitTime - enterTime) / 86400000);
        if (!stageDurations[h.from_stage_id]) stageDurations[h.from_stage_id] = [];
        stageDurations[h.from_stage_id].push(days);
      }
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

  // --- Hot conversations (TG groups with most messages in 24h) ---
  const groupMessageCounts: Record<string, { name: string; count: number; deal_name: string; deal_id: string }> = {};
  for (const n of recentMessages) {
    const group = n.tg_group as unknown as { group_name: string } | null;
    const deal = n.deal as unknown as { id: string; deal_name: string } | null;
    const key = group?.group_name ?? "Unknown";
    if (!groupMessageCounts[key]) {
      groupMessageCounts[key] = { name: key, count: 0, deal_name: deal?.deal_name ?? "", deal_id: deal?.id ?? "" };
    }
    groupMessageCounts[key].count++;
  }
  const hotConversations = Object.values(groupMessageCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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
    pinnedDeals: pinnedDeals.map((d) => ({
      id: d.id, deal_name: d.deal_name, board_type: d.board_type, value: d.value,
      stage_name: (d.stage as unknown as { name: string } | null)?.name ?? "",
      stage_color: (d.stage as unknown as { color: string } | null)?.color ?? null,
    })),
  });
}
