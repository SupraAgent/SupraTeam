import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const [responseTimeRes, groupsRes, workflowsRes, workflowRunsRes, suggestionsRes] = await Promise.all([
    // Avg response time from resolved highlights (last 30 days)
    supabase
      .from("crm_highlights")
      .select("response_time_ms, created_at")
      .not("response_time_ms", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200),

    // TG group health
    supabase
      .from("tg_groups")
      .select("id, group_name, member_count, message_count_7d, health_status, bot_is_admin, last_message_at, is_archived")
      .eq("is_archived", false)
      .order("message_count_7d", { ascending: false })
      .limit(20),

    // Active workflows
    supabase
      .from("crm_workflows")
      .select("id, name, is_active, run_count, last_run_at")
      .eq("is_active", true),

    // Recent workflow runs (last 7 days)
    supabase
      .from("crm_workflow_runs")
      .select("id, status, started_at")
      .gte("started_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Top suggestions
    supabase
      .from("crm_feature_suggestions")
      .select("id, title, cpo_score, upvotes, status, category")
      .order("cpo_score", { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  // --- Response Time ---
  const responseTimes = (responseTimeRes.data ?? [])
    .map((h) => Number(h.response_time_ms))
    .filter((ms) => ms > 0);

  const avgResponseMs = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  const medianResponseMs = responseTimes.length > 0
    ? (() => {
        const sorted = [...responseTimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      })()
    : null;

  // Daily response time trend (last 7 days)
  const dailyResponseTimes: { date: string; avg_ms: number }[] = [];
  const dayBuckets: Record<string, number[]> = {};
  for (const h of responseTimeRes.data ?? []) {
    const day = h.created_at.substring(0, 10);
    if (!dayBuckets[day]) dayBuckets[day] = [];
    dayBuckets[day].push(Number(h.response_time_ms));
  }
  for (const [date, times] of Object.entries(dayBuckets).sort(([a], [b]) => a.localeCompare(b)).slice(-7)) {
    dailyResponseTimes.push({
      date,
      avg_ms: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    });
  }

  // --- TG Group Health ---
  const groups = (groupsRes.data ?? []).map((g) => ({
    id: g.id,
    name: g.group_name,
    member_count: g.member_count ?? 0,
    messages_7d: g.message_count_7d ?? 0,
    health: g.health_status ?? "unknown",
    bot_admin: g.bot_is_admin ?? false,
    last_active: g.last_message_at,
  }));

  const groupHealthSummary = {
    total: groups.length,
    active: groups.filter((g) => g.health === "active").length,
    quiet: groups.filter((g) => g.health === "quiet").length,
    stale: groups.filter((g) => g.health === "stale").length,
    dead: groups.filter((g) => g.health === "dead").length,
    total_members: groups.reduce((s, g) => s + g.member_count, 0),
    total_messages_7d: groups.reduce((s, g) => s + g.messages_7d, 0),
    bot_admin_count: groups.filter((g) => g.bot_admin).length,
  };

  // --- Workflows ---
  const activeWorkflows = workflowsRes.data ?? [];
  const recentRuns = workflowRunsRes.data ?? [];
  const workflowStats = {
    active_count: activeWorkflows.length,
    runs_7d: recentRuns.length,
    completed: recentRuns.filter((r) => r.status === "completed").length,
    failed: recentRuns.filter((r) => r.status === "failed").length,
    running: recentRuns.filter((r) => r.status === "running").length,
  };

  // --- Top Suggestions ---
  const suggestions = (suggestionsRes.data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    score: s.cpo_score,
    upvotes: s.upvotes ?? 0,
    status: s.status,
    category: s.category,
  }));

  return NextResponse.json({
    responseTime: {
      avg_ms: avgResponseMs,
      median_ms: medianResponseMs,
      sample_count: responseTimes.length,
      daily_trend: dailyResponseTimes,
    },
    groups,
    groupHealthSummary,
    workflowStats,
    suggestions,
  });
}
