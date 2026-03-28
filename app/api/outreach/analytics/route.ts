/**
 * GET /api/outreach/analytics
 * TG outreach sequence performance analytics: step funnels, reply rates, completion rates.
 * Optionally filter by ?sequence_id=... for detailed single-sequence view.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const url = new URL(request.url);
  const sequenceId = url.searchParams.get("sequence_id");

  if (sequenceId) {
    return getSequenceDetail(supabase, sequenceId);
  }

  // Overview: all sequences with stats
  const { data: sequences } = await supabase
    .from("crm_outreach_sequences")
    .select("id, name, status, board_type, goal_stage_id")
    .order("created_at", { ascending: false });

  if (!sequences || sequences.length === 0) {
    return NextResponse.json({ sequences: [] });
  }

  // Batch: get step counts
  const seqIds = sequences.map((s) => s.id);
  const { data: steps } = await supabase
    .from("crm_outreach_steps")
    .select("sequence_id")
    .in("sequence_id", seqIds);

  const stepCounts: Record<string, number> = {};
  for (const s of steps ?? []) {
    stepCounts[s.sequence_id] = (stepCounts[s.sequence_id] ?? 0) + 1;
  }

  // Batch: get enrollment stats
  const { data: enrollments } = await supabase
    .from("crm_outreach_enrollments")
    .select("sequence_id, status, reply_count")
    .in("sequence_id", seqIds);

  const seqStats: Record<string, { total: number; active: number; completed: number; replied: number; paused: number }> = {};
  for (const e of enrollments ?? []) {
    if (!seqStats[e.sequence_id]) seqStats[e.sequence_id] = { total: 0, active: 0, completed: 0, replied: 0, paused: 0 };
    const s = seqStats[e.sequence_id];
    s.total++;
    if (e.status === "active") s.active++;
    if (e.status === "completed") s.completed++;
    if (e.status === "paused") s.paused++;
    if (e.reply_count > 0) s.replied++;
  }

  const result = sequences.map((seq) => {
    const stats = seqStats[seq.id] ?? { total: 0, active: 0, completed: 0, replied: 0, paused: 0 };
    return {
      id: seq.id,
      name: seq.name,
      status: seq.status,
      board_type: seq.board_type,
      step_count: stepCounts[seq.id] ?? 0,
      ...stats,
      reply_rate: stats.total > 0 ? Math.round((stats.replied / stats.total) * 100) : 0,
      completion_rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
    };
  });

  return NextResponse.json({ sequences: result });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSequenceDetail(supabase: any, sequenceId: string) {
  const [seqRes, stepsRes, enrollmentsRes, stepLogsRes] = await Promise.all([
    supabase.from("crm_outreach_sequences").select("id, name, status, board_type").eq("id", sequenceId).single(),
    supabase.from("crm_outreach_steps").select("id, step_number, step_type, step_label, delay_hours, message_template").eq("sequence_id", sequenceId).order("step_number"),
    supabase.from("crm_outreach_enrollments").select("id, status, reply_count, current_step, enrolled_at").eq("sequence_id", sequenceId),
    supabase.from("crm_outreach_step_log").select("step_id, status, enrollment_id").eq("status", "sent").in("enrollment_id",
      (await supabase.from("crm_outreach_enrollments").select("id").eq("sequence_id", sequenceId)).data?.map((e: { id: string }) => e.id) ?? []
    ),
  ]);

  const sequence = seqRes.data;
  const steps = (stepsRes.data ?? []) as Array<{ id: string; step_number: number; step_type: string; step_label: string | null; delay_hours: number; message_template: string }>;
  const enrollments = (enrollmentsRes.data ?? []) as Array<{ id: string; status: string; reply_count: number; current_step: number; enrolled_at: string }>;
  const stepLogs = (stepLogsRes.data ?? []) as Array<{ step_id: string; status: string; enrollment_id: string }>;

  // Status counts
  const statusCounts: Record<string, number> = {};
  for (const e of enrollments) {
    statusCounts[e.status] = (statusCounts[e.status] ?? 0) + 1;
  }

  const total = enrollments.length;
  const replied = enrollments.filter((e) => e.reply_count > 0).length;

  // Step-level funnel
  const sentByStep = new Map<string, Set<string>>();
  for (const log of stepLogs) {
    if (!sentByStep.has(log.step_id)) sentByStep.set(log.step_id, new Set());
    sentByStep.get(log.step_id)!.add(log.enrollment_id);
  }

  const stepStats = steps.filter((s) => s.step_type === "message").map((step) => {
    const sentSet = sentByStep.get(step.id);
    return {
      step_number: step.step_number,
      step_label: step.step_label ?? `Step ${step.step_number}`,
      step_type: step.step_type,
      delay_hours: step.delay_hours,
      sent: sentSet?.size ?? 0,
      preview: step.message_template.slice(0, 60),
    };
  });

  // Enrollment timeline (daily enrollments for the last 30 days)
  const dailyEnrollments: Record<string, number> = {};
  for (const e of enrollments) {
    const day = e.enrolled_at.slice(0, 10);
    dailyEnrollments[day] = (dailyEnrollments[day] ?? 0) + 1;
  }

  return NextResponse.json({
    sequence,
    total,
    replied,
    reply_rate: total > 0 ? Math.round((replied / total) * 100) : 0,
    completion_rate: total > 0 ? Math.round(((statusCounts.completed ?? 0) / total) * 100) : 0,
    status_counts: statusCounts,
    step_stats: stepStats,
    daily_enrollments: Object.entries(dailyEnrollments)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30),
  });
}
