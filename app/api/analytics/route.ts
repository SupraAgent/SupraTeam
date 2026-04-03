import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, probability, outcome, outcome_at, outcome_reason, created_at, health_score, expected_close_date, stage:pipeline_stages(name, position)");

  if (!deals) return NextResponse.json({ error: "Failed" }, { status: 500 });

  // Win/loss stats
  const won = deals.filter((d) => d.outcome === "won");
  const lost = deals.filter((d) => d.outcome === "lost");
  const open = deals.filter((d) => d.outcome === "open" || !d.outcome);

  const winRate = won.length + lost.length > 0
    ? Math.round((won.length / (won.length + lost.length)) * 100)
    : null;

  // Win rate by board
  const winRateByBoard: Record<string, number | null> = {};
  for (const board of ["BD", "Marketing", "Admin"]) {
    const bWon = won.filter((d) => d.board_type === board).length;
    const bLost = lost.filter((d) => d.board_type === board).length;
    winRateByBoard[board] = bWon + bLost > 0 ? Math.round((bWon / (bWon + bLost)) * 100) : null;
  }

  // Revenue: won, pipeline, weighted
  const wonRevenue = won.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const pipelineValue = open.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const weightedPipeline = open.reduce((sum, d) => sum + Number(d.value ?? 0) * (Number(d.probability ?? 50) / 100), 0);

  // Monthly forecast (deals with expected_close_date)
  const monthlyForecast: Record<string, number> = {};
  for (const deal of open) {
    if (deal.expected_close_date) {
      const month = deal.expected_close_date.substring(0, 7); // YYYY-MM
      const weighted = Number(deal.value ?? 0) * (Number(deal.probability ?? 50) / 100);
      monthlyForecast[month] = (monthlyForecast[month] ?? 0) + weighted;
    }
  }

  // Lost reasons
  const lostReasons: Record<string, number> = {};
  for (const deal of lost) {
    const reason = deal.outcome_reason ?? "No reason given";
    lostReasons[reason] = (lostReasons[reason] ?? 0) + 1;
  }

  // Health distribution
  const healthDist = { critical: 0, warning: 0, healthy: 0, excellent: 0 };
  for (const deal of open) {
    const h = deal.health_score ?? 50;
    if (h < 25) healthDist.critical++;
    else if (h < 50) healthDist.warning++;
    else if (h < 75) healthDist.healthy++;
    else healthDist.excellent++;
  }

  // Average days to close (won deals)
  let avgDaysToClose = null;
  if (won.length > 0) {
    const totalDays = won.reduce((sum, d) => {
      const created = new Date(d.created_at).getTime();
      const closed = new Date(d.outcome_at ?? d.created_at).getTime();
      return sum + (closed - created) / 86400000;
    }, 0);
    avgDaysToClose = Math.round(totalDays / won.length);
  }

  return NextResponse.json({
    winRate,
    winRateByBoard,
    wonRevenue: Math.round(wonRevenue),
    lostRevenue: Math.round(lost.reduce((s, d) => s + Number(d.value ?? 0), 0)),
    pipelineValue: Math.round(pipelineValue),
    weightedPipeline: Math.round(weightedPipeline),
    monthlyForecast,
    lostReasons: Object.entries(lostReasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    healthDistribution: healthDist,
    avgDaysToClose,
    totalWon: won.length,
    totalLost: lost.length,
    totalOpen: open.length,
  });
}
