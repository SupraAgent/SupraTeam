/**
 * GET /api/forecast — Pipeline forecast analytics
 *
 * Returns:
 * - Monthly revenue forecast (weighted by probability)
 * - Deal velocity: avg days per stage based on stage history
 * - Forecast confidence: based on historical accuracy (expected vs actual close)
 * - Pipeline trend: weekly deal creation/close rate
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const twelveWeeksAgo = new Date(Date.now() - 84 * 86400000).toISOString();

  // ── Run all 5 independent queries in parallel ──
  const [
    { data: openDeals },
    { data: recentHistory },
    { data: closedDeals },
    { data: createdRecent },
    { data: closedRecent },
  ] = await Promise.all([
    supabase
      .from("crm_deals")
      .select("id, deal_name, value, probability, expected_close_date, board_type, created_at, stage:pipeline_stages(name)")
      .eq("outcome", "open")
      .not("expected_close_date", "is", null)
      .order("expected_close_date"),
    supabase
      .from("crm_deal_stage_history")
      .select("deal_id, from_stage_id, to_stage_id, changed_at, from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)")
      .gte("changed_at", ninetyDaysAgo)
      .order("changed_at"),
    supabase
      .from("crm_deals")
      .select("expected_close_date, outcome_at, outcome")
      .in("outcome", ["won", "lost"])
      .not("expected_close_date", "is", null)
      .not("outcome_at", "is", null)
      .gte("outcome_at", ninetyDaysAgo)
      .limit(200),
    supabase
      .from("crm_deals")
      .select("created_at")
      .gte("created_at", twelveWeeksAgo),
    supabase
      .from("crm_deals")
      .select("outcome_at, outcome")
      .in("outcome", ["won", "lost"])
      .not("outcome_at", "is", null)
      .gte("outcome_at", twelveWeeksAgo),
  ]);

  // ── Monthly forecast: open deals grouped by expected_close_date ──
  const monthlyForecast: Record<string, { count: number; totalValue: number; weightedValue: number }> = {};
  for (const deal of openDeals ?? []) {
    const month = (deal.expected_close_date as string).substring(0, 7); // YYYY-MM
    if (!monthlyForecast[month]) monthlyForecast[month] = { count: 0, totalValue: 0, weightedValue: 0 };
    const val = Number(deal.value ?? 0);
    const prob = Number(deal.probability ?? 50);
    monthlyForecast[month].count++;
    monthlyForecast[month].totalValue += val;
    monthlyForecast[month].weightedValue += val * (prob / 100);
  }

  // ── Deal velocity: avg days in each stage (from stage history) ──
  // Build a map of deal_id → created_at for first-stage entry time
  const dealCreatedAt = new Map<string, string>();
  for (const deal of openDeals ?? []) {
    dealCreatedAt.set(deal.id as string, deal.created_at as string);
  }

  // Group stage transitions by deal
  const dealTransitions = new Map<string, Array<{ stage: string; leftAt: string }>>();
  for (const h of recentHistory ?? []) {
    const dealId = h.deal_id as string;
    if (!dealTransitions.has(dealId)) dealTransitions.set(dealId, []);
    const fromName = (h.from_stage as unknown as { name: string } | null)?.name ?? "Unknown";
    dealTransitions.get(dealId)!.push({
      stage: fromName,
      leftAt: h.changed_at as string,
    });
  }

  // Compute avg days per stage (including first stage using deal created_at)
  const stageDurations: Record<string, number[]> = {};
  for (const [dealId, transitions] of dealTransitions) {
    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i];
      // First transition: time from deal creation to first stage change
      const enteredAt = i === 0 ? (dealCreatedAt.get(dealId) ?? t.leftAt) : transitions[i - 1].leftAt;
      const days = (new Date(t.leftAt).getTime() - new Date(enteredAt).getTime()) / 86400000;
      if (days >= 0 && days < 365) {
        if (!stageDurations[t.stage]) stageDurations[t.stage] = [];
        stageDurations[t.stage].push(days);
      }
    }
  }

  const stageVelocity: Record<string, { avgDays: number; dealCount: number }> = {};
  for (const [stage, durations] of Object.entries(stageDurations)) {
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    stageVelocity[stage] = { avgDays: Math.round(avg * 10) / 10, dealCount: durations.length };
  }

  // ── Forecast confidence: compare expected_close_date vs actual outcome_at ──
  let forecastAccuracy = 0;
  let onTimeCount = 0;
  let totalClosed = 0;
  const lagDays: number[] = [];

  for (const deal of closedDeals ?? []) {
    totalClosed++;
    const expected = new Date(deal.expected_close_date as string).getTime();
    const actual = new Date(deal.outcome_at as string).getTime();
    const lag = (actual - expected) / 86400000;
    lagDays.push(lag);
    if (Math.abs(lag) <= 7) onTimeCount++;
  }

  if (totalClosed > 0) {
    forecastAccuracy = Math.round((onTimeCount / totalClosed) * 100);
  }

  const avgLag = lagDays.length > 0
    ? Math.round((lagDays.reduce((s, d) => s + d, 0) / lagDays.length) * 10) / 10
    : 0;

  // ── Weekly pipeline trend: deals created/closed per week (last 12 weeks) ──

  // ISO 8601 week number calculation
  function toWeekKey(date: string): string {
    const d = new Date(date);
    // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
    const day = d.getDay() || 7; // convert Sun=0 to Sun=7
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${thursday.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }

  const weeklyTrend: Record<string, { created: number; won: number; lost: number }> = {};
  for (const deal of createdRecent ?? []) {
    const week = toWeekKey(deal.created_at as string);
    if (!weeklyTrend[week]) weeklyTrend[week] = { created: 0, won: 0, lost: 0 };
    weeklyTrend[week].created++;
  }
  for (const deal of closedRecent ?? []) {
    const week = toWeekKey(deal.outcome_at as string);
    if (!weeklyTrend[week]) weeklyTrend[week] = { created: 0, won: 0, lost: 0 };
    if (deal.outcome === "won") weeklyTrend[week].won++;
    else weeklyTrend[week].lost++;
  }

  // Sort weeks chronologically
  const trendEntries = Object.entries(weeklyTrend).sort(([a], [b]) => a.localeCompare(b));

  return NextResponse.json({
    monthlyForecast,
    stageVelocity,
    forecastConfidence: {
      accuracy: forecastAccuracy,
      avgLagDays: avgLag,
      onTimeCount,
      totalClosed,
    },
    weeklyTrend: trendEntries.map(([week, data]) => ({ week, ...data })),
  });
}
