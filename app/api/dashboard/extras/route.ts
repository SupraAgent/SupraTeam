import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

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
  const responseRows = responseTimeRes.data as { response_time_ms: number; created_at: string }[] | null;
  const responseTimes = (responseRows ?? [])
    .map((h: { response_time_ms: number }) => Number(h.response_time_ms))
    .filter((ms: number) => ms > 0);

  const avgResponseMs = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
    : null;

  const medianResponseMs = responseTimes.length > 0
    ? (() => {
        const sorted = [...responseTimes].sort((a: number, b: number) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      })()
    : null;

  // Daily response time trend (last 7 days)
  const dailyResponseTimes: { date: string; avg_ms: number }[] = [];
  const dayBuckets: Record<string, number[]> = {};
  for (const h of responseRows ?? []) {
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
  interface GroupRow { id: string; group_name: string; member_count: number | null; message_count_7d: number | null; health_status: string | null; bot_is_admin: boolean | null; last_message_at: string | null; is_archived: boolean }
  const groupRows = (groupsRes.data ?? []) as GroupRow[];
  const groups = groupRows.map((g: GroupRow) => ({
    id: g.id,
    name: g.group_name,
    member_count: g.member_count ?? 0,
    messages_7d: g.message_count_7d ?? 0,
    health: g.health_status ?? "unknown",
    bot_admin: g.bot_is_admin ?? false,
    last_active: g.last_message_at,
  }));

  type GroupItem = typeof groups[number];
  const groupHealthSummary = {
    total: groups.length,
    active: groups.filter((g: GroupItem) => g.health === "active").length,
    quiet: groups.filter((g: GroupItem) => g.health === "quiet").length,
    stale: groups.filter((g: GroupItem) => g.health === "stale").length,
    dead: groups.filter((g: GroupItem) => g.health === "dead").length,
    total_members: groups.reduce((s: number, g: GroupItem) => s + g.member_count, 0),
    total_messages_7d: groups.reduce((s: number, g: GroupItem) => s + g.messages_7d, 0),
    bot_admin_count: groups.filter((g: GroupItem) => g.bot_admin).length,
  };

  // --- Workflows ---
  const activeWorkflows = workflowsRes.data ?? [];
  interface RunRow { id: string; status: string; started_at: string }
  const recentRuns = (workflowRunsRes.data ?? []) as RunRow[];
  const workflowStats = {
    active_count: activeWorkflows.length,
    runs_7d: recentRuns.length,
    completed: recentRuns.filter((r: RunRow) => r.status === "completed").length,
    failed: recentRuns.filter((r: RunRow) => r.status === "failed").length,
    running: recentRuns.filter((r: RunRow) => r.status === "running").length,
  };

  // --- Top Suggestions ---
  interface SuggestionRow { id: string; title: string; cpo_score: number | null; upvotes: number | null; status: string; category: string }
  const suggestions = ((suggestionsRes.data ?? []) as SuggestionRow[]).map((s: SuggestionRow) => ({
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
