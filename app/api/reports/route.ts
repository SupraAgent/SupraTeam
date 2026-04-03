import { NextRequest, NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const compareFrom = req.nextUrl.searchParams.get("compareFrom");
  const compareTo = req.nextUrl.searchParams.get("compareTo");

  // Fetch all deals (with optional date filter)
  let dealsQuery = supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, probability, outcome, outcome_at, outcome_reason, created_at, updated_at, stage_changed_at, health_score, expected_close_date, assigned_to, stage:pipeline_stages(name, position, color), assigned_profile:profiles!crm_deals_assigned_to_fkey(display_name)")
    .order("created_at", { ascending: false });

  if (from) dealsQuery = dealsQuery.gte("created_at", from);
  if (to) dealsQuery = dealsQuery.lte("created_at", to);

  // Fetch stage history for velocity
  let historyQuery = supabase
    .from("crm_deal_stage_history")
    .select("id, deal_id, from_stage_id, to_stage_id, changed_at")
    .order("changed_at", { ascending: false });

  if (from) historyQuery = historyQuery.gte("changed_at", from);
  if (to) historyQuery = historyQuery.lte("changed_at", to);

  const stagesQuery = supabase.from("pipeline_stages").select("id, name, position, color").order("position");

  const [dealsRes, historyRes, stagesRes] = await Promise.all([
    dealsQuery,
    historyQuery,
    stagesQuery,
  ]);

  const deals = dealsRes.data ?? [];
  const history = historyRes.data ?? [];
  const stages = stagesRes.data ?? [];

  // --- Comparison period deals ---
  type CompDeal = { id: string; value: unknown; outcome: string | null; outcome_at: string | null; outcome_reason: string | null };
  let compDeals: CompDeal[] = [];
  if (compareFrom && compareTo) {
    const { data } = await supabase
      .from("crm_deals")
      .select("id, value, probability, outcome, outcome_at, outcome_reason, created_at")
      .gte("created_at", compareFrom)
      .lte("created_at", compareTo);
    compDeals = (data ?? []) as CompDeal[];
  }

  // --- Core metrics ---
  const won = deals.filter((d) => d.outcome === "won");
  const lost = deals.filter((d) => d.outcome === "lost");
  const open = deals.filter((d) => d.outcome === "open" || !d.outcome);

  const winRate = won.length + lost.length > 0
    ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
  const wonRevenue = won.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const lostRevenue = lost.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const pipelineValue = open.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const weightedPipeline = open.reduce((s, d) => s + Number(d.value ?? 0) * (Number(d.probability ?? 50) / 100), 0);

  // Avg days to close
  let avgDaysToClose: number | null = null;
  if (won.length > 0) {
    const totalDays = won.reduce((s, d) => {
      const c = new Date(d.created_at).getTime();
      const cl = new Date(d.outcome_at ?? d.created_at).getTime();
      return s + (cl - c) / 86400000;
    }, 0);
    avgDaysToClose = Math.round(totalDays / won.length);
  }

  // --- By board ---
  const boardMetrics: Record<string, { deals: number; won: number; lost: number; revenue: number; pipeline: number }> = {};
  for (const b of ["BD", "Marketing", "Admin"]) {
    const bd = deals.filter((d) => d.board_type === b);
    const bw = bd.filter((d) => d.outcome === "won");
    const bl = bd.filter((d) => d.outcome === "lost");
    const bo = bd.filter((d) => !d.outcome || d.outcome === "open");
    boardMetrics[b] = {
      deals: bd.length,
      won: bw.length,
      lost: bl.length,
      revenue: bw.reduce((s, d) => s + Number(d.value ?? 0), 0),
      pipeline: bo.reduce((s, d) => s + Number(d.value ?? 0), 0),
    };
  }

  // --- Pipeline funnel ---
  const funnel = stages.map((s) => {
    const count = deals.filter((d) => {
      const ds = d.stage as unknown as { position: number } | null;
      return ds && ds.position === s.position;
    }).length;
    return { name: s.name, count, color: s.color, position: s.position };
  });

  // --- Stage conversion ---
  const stageConversions = stages.slice(0, -1).map((s, i) => {
    const next = stages[i + 1];
    const fromCount = history.filter((h) => h.from_stage_id === s.id).length;
    const toNext = history.filter((h) => h.from_stage_id === s.id && h.to_stage_id === next?.id).length;
    return {
      from: s.name,
      to: next?.name ?? "",
      rate: fromCount > 0 ? Math.round((toNext / fromCount) * 100) : null,
      volume: fromCount,
      color: s.color,
    };
  });

  // --- Deals created over time (daily buckets) ---
  const createdByDay: Record<string, number> = {};
  const wonByDay: Record<string, number> = {};
  const lostByDay: Record<string, number> = {};
  for (const d of deals) {
    const day = d.created_at.substring(0, 10);
    createdByDay[day] = (createdByDay[day] ?? 0) + 1;
  }
  for (const d of won) {
    const day = (d.outcome_at ?? d.created_at).substring(0, 10);
    wonByDay[day] = (wonByDay[day] ?? 0) + 1;
  }
  for (const d of lost) {
    const day = (d.outcome_at ?? d.created_at).substring(0, 10);
    lostByDay[day] = (lostByDay[day] ?? 0) + 1;
  }

  // --- Lost reasons ---
  const lostReasons: Record<string, number> = {};
  for (const d of lost) {
    const r = d.outcome_reason ?? "No reason";
    lostReasons[r] = (lostReasons[r] ?? 0) + 1;
  }

  // --- Team leaderboard ---
  const teamMap: Record<string, { name: string; deals: number; won: number; revenue: number }> = {};
  for (const d of deals) {
    const profile = d.assigned_profile as unknown as { display_name: string } | null;
    const key = d.assigned_to ?? "__unassigned";
    const name = profile?.display_name ?? "Unassigned";
    if (!teamMap[key]) teamMap[key] = { name, deals: 0, won: 0, revenue: 0 };
    teamMap[key].deals++;
    if (d.outcome === "won") {
      teamMap[key].won++;
      teamMap[key].revenue += Number(d.value ?? 0);
    }
  }

  // --- Health distribution ---
  const healthDist = { critical: 0, warning: 0, healthy: 0, excellent: 0 };
  for (const d of open) {
    const h = d.health_score ?? 50;
    if (h < 25) healthDist.critical++;
    else if (h < 50) healthDist.warning++;
    else if (h < 75) healthDist.healthy++;
    else healthDist.excellent++;
  }

  // --- Deal aging (avg days in current stage for open deals) ---
  const now = Date.now();
  const dealAging = stages.map((s) => {
    const inStage = open.filter((d) => {
      const ds = d.stage as unknown as { position: number } | null;
      return ds && ds.position === s.position;
    });
    const totalDays = inStage.reduce((sum, d) => sum + (now - new Date(d.stage_changed_at).getTime()) / 86400000, 0);
    return {
      name: s.name,
      color: s.color,
      count: inStage.length,
      avg_days: inStage.length > 0 ? Math.round(totalDays / inStage.length) : 0,
    };
  });

  // --- Comparison metrics ---
  let comparison: Record<string, unknown> | null = null;
  if (compDeals.length > 0) {
    const cWon = compDeals.filter((d) => d.outcome === "won");
    const cLost = compDeals.filter((d) => d.outcome === "lost");
    const cWinRate = cWon.length + cLost.length > 0
      ? Math.round((cWon.length / (cWon.length + cLost.length)) * 100) : null;
    comparison = {
      totalDeals: compDeals.length,
      wonCount: cWon.length,
      lostCount: cLost.length,
      winRate: cWinRate,
      wonRevenue: cWon.reduce((s, d) => s + Number(d.value ?? 0), 0),
    };
  }

  return NextResponse.json({
    // Summary
    totalDeals: deals.length,
    wonCount: won.length,
    lostCount: lost.length,
    openCount: open.length,
    winRate,
    wonRevenue: Math.round(wonRevenue),
    lostRevenue: Math.round(lostRevenue),
    pipelineValue: Math.round(pipelineValue),
    weightedPipeline: Math.round(weightedPipeline),
    avgDaysToClose,
    // Breakdowns
    boardMetrics,
    funnel,
    stageConversions,
    dealAging,
    healthDistribution: healthDist,
    lostReasons: Object.entries(lostReasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    teamLeaderboard: Object.values(teamMap).sort((a, b) => b.revenue - a.revenue),
    // Trends
    createdByDay,
    wonByDay,
    lostByDay,
    // Comparison
    comparison,
  });
}
