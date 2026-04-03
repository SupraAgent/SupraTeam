import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { SupabaseClient } from "@supabase/supabase-js";

// Shared recalculation logic used by both POST and GET
async function recalculateHealthScores(supabase: SupabaseClient): Promise<number> {
  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, stage_id, value, probability, updated_at, stage_changed_at, created_at, outcome, telegram_chat_id, tg_group_id")
    .eq("outcome", "open");

  if (!deals || deals.length === 0) return 0;

  const { data: stages } = await supabase.from("pipeline_stages").select("id, position").order("position");
  const stagePositions: Record<string, number> = {};
  const maxPosition = stages?.length ?? 1;
  for (const s of stages ?? []) stagePositions[s.id] = s.position;

  // Count recent notifications per deal (activity proxy)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNotifs } = await supabase
    .from("crm_notifications")
    .select("deal_id")
    .gte("created_at", sevenDaysAgo);

  const activityCount: Record<string, number> = {};
  for (const n of recentNotifs ?? []) {
    if (n.deal_id) activityCount[n.deal_id] = (activityCount[n.deal_id] ?? 0) + 1;
  }

  let updated = 0;
  for (const deal of deals) {
    const now = Date.now();
    const daysSinceUpdate = (now - new Date(deal.updated_at).getTime()) / 86400000;
    const daysSinceStageChange = (now - new Date(deal.stage_changed_at ?? deal.created_at).getTime()) / 86400000;
    const stageProgress = deal.stage_id ? (stagePositions[deal.stage_id] ?? 1) / maxPosition : 0;
    const hasActivity = (activityCount[deal.id] ?? 0) > 0;
    const hasTgLink = !!(deal.telegram_chat_id || deal.tg_group_id);

    // Score components (0-100 each)
    const recencyScore = Math.max(0, 100 - daysSinceUpdate * 10); // Loses 10pts per day inactive
    const stageVelocityScore = Math.max(0, 100 - daysSinceStageChange * 5); // Loses 5pts per day in same stage
    const progressScore = stageProgress * 100; // Further along = better
    const activityScore = hasActivity ? 80 : 30; // Recent TG activity = healthy
    const connectionScore = hasTgLink ? 90 : 50; // TG linked = better
    const probabilityScore = deal.probability ?? 50;

    // Weighted average
    const health = Math.round(
      recencyScore * 0.25 +
      stageVelocityScore * 0.20 +
      progressScore * 0.15 +
      activityScore * 0.15 +
      connectionScore * 0.10 +
      probabilityScore * 0.15
    );

    const clampedHealth = Math.max(0, Math.min(100, health));

    await supabase.from("crm_deals").update({ health_score: clampedHealth }).eq("id", deal.id);
    updated++;
  }

  return updated;
}

// Calculate health score for all deals and update them
// Score 0-100: higher is healthier
export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const updated = await recalculateHealthScores(supabase);
  return NextResponse.json({ updated });
}

// GET to recalculate and return all scores
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // Recalculate directly instead of self-fetching
  await recalculateHealthScores(supabase);

  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, deal_name, health_score, outcome")
    .order("health_score", { ascending: true });

  return NextResponse.json({ deals: deals ?? [] });
}
