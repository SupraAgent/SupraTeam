/**
 * GET /api/groups/engagement — Group engagement scores.
 *
 * Query params:
 *   days    — lookback period in days (default 30)
 *   limit   — max results (default 50, max 100)
 *
 * Returns groups sorted by engagement score (0-100).
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get("days") ?? 30), 365);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const { data, error } = await supabase.rpc("crm_group_engagement_scores", {
    p_user_id: user.id,
    p_days: days,
    p_limit: limit,
  });

  if (error) {
    console.error("[groups/engagement]", error.message);
    return NextResponse.json({ error: "Failed to fetch engagement scores" }, { status: 500 });
  }

  // Enrich with group names
  const chatIds = (data ?? []).map((r: Record<string, unknown>) => r.chat_id);
  const { data: groups } = await supabase
    .from("tg_groups")
    .select("telegram_group_id, group_name")
    .in("telegram_group_id", chatIds);

  const nameMap = new Map(
    (groups ?? []).map((g: Record<string, unknown>) => [String(g.telegram_group_id), g.group_name])
  );

  const scores = (data ?? []).map((row: Record<string, unknown>) => ({
    chat_id: row.chat_id,
    group_name: nameMap.get(String(row.chat_id)) ?? `Chat ${row.chat_id}`,
    total_messages: Number(row.total_messages),
    unique_senders: Number(row.unique_senders),
    avg_daily_messages: Number(row.avg_daily_messages),
    engagement_score: Number(row.engagement_score),
  }));

  return NextResponse.json({ scores, days, source: "rpc" });
}
