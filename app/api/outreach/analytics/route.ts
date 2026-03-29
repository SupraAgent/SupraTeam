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
  // Phase 1: run independent queries in parallel
  const [seqRes, stepsRes, enrollmentsRes] = await Promise.all([
    supabase.from("crm_outreach_sequences").select("id, name, status, board_type").eq("id", sequenceId).single(),
    supabase.from("crm_outreach_steps").select("id, step_number, step_type, step_label, delay_hours, message_template, variant_b_template, variant_c_template").eq("sequence_id", sequenceId).order("step_number"),
    supabase.from("crm_outreach_enrollments").select("id, status, reply_count, current_step, enrolled_at, ab_variant").eq("sequence_id", sequenceId),
  ]);

  const sequence = seqRes.data;
  const steps = (stepsRes.data ?? []) as Array<{ id: string; step_number: number; step_type: string; step_label: string | null; delay_hours: number; message_template: string; variant_b_template: string | null; variant_c_template: string | null }>;
  const enrollments = (enrollmentsRes.data ?? []) as Array<{ id: string; status: string; reply_count: number; current_step: number; enrolled_at: string; ab_variant: string | null }>;

  // Phase 2: step logs depend on enrollment IDs from phase 1
  const enrollmentIds = enrollments.map((e) => e.id);
  const stepLogs: Array<{ step_id: string; status: string; enrollment_id: string; ab_variant: string | null }> = [];
  if (enrollmentIds.length > 0) {
    const { data } = await supabase
      .from("crm_outreach_step_log")
      .select("step_id, status, enrollment_id, ab_variant")
      .eq("status", "sent")
      .in("enrollment_id", enrollmentIds);
    if (data) stepLogs.push(...data);
  }

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

  // Per-step variant tracking for step-level A/B data
  const stepVariantLogs = new Map<string, { a_enrollments: Set<string>; b_enrollments: Set<string>; c_enrollments: Set<string> }>();
  for (const log of stepLogs) {
    if (log.ab_variant) {
      if (!stepVariantLogs.has(log.step_id)) {
        stepVariantLogs.set(log.step_id, { a_enrollments: new Set(), b_enrollments: new Set(), c_enrollments: new Set() });
      }
      const sv = stepVariantLogs.get(log.step_id)!;
      if (log.ab_variant === "A") sv.a_enrollments.add(log.enrollment_id);
      else if (log.ab_variant === "B") sv.b_enrollments.add(log.enrollment_id);
      else if (log.ab_variant === "C") sv.c_enrollments.add(log.enrollment_id);
    }
  }

  const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

  const stepStats = steps.filter((s) => s.step_type === "message").map((step) => {
    const sentSet = sentByStep.get(step.id);
    const sv = stepVariantLogs.get(step.id);

    // Per-step A/B(/C) data
    let ab: { a_sent: number; b_sent: number; a_reply_rate: number; b_reply_rate: number; c_sent?: number; c_reply_rate?: number } | null = null;
    if (sv && step.variant_b_template) {
      const aIds = [...sv.a_enrollments];
      const bIds = [...sv.b_enrollments];
      const aReplied = aIds.filter((id) => (enrollmentMap.get(id)?.reply_count ?? 0) > 0).length;
      const bReplied = bIds.filter((id) => (enrollmentMap.get(id)?.reply_count ?? 0) > 0).length;

      ab = {
        a_sent: aIds.length,
        b_sent: bIds.length,
        a_reply_rate: aIds.length > 0 ? Math.round((aReplied / aIds.length) * 100) : 0,
        b_reply_rate: bIds.length > 0 ? Math.round((bReplied / bIds.length) * 100) : 0,
      };

      // Add variant C if present
      if (step.variant_c_template && sv.c_enrollments.size > 0) {
        const cIds = [...sv.c_enrollments];
        const cReplied = cIds.filter((id) => (enrollmentMap.get(id)?.reply_count ?? 0) > 0).length;
        ab.c_sent = cIds.length;
        ab.c_reply_rate = cIds.length > 0 ? Math.round((cReplied / cIds.length) * 100) : 0;
      }
    }

    return {
      step_number: step.step_number,
      step_label: step.step_label ?? `Step ${step.step_number}`,
      step_type: step.step_type,
      delay_hours: step.delay_hours,
      sent: sentSet?.size ?? 0,
      preview: step.message_template.slice(0, 60),
      ab,
    };
  });

  // Enrollment timeline (daily enrollments for the last 30 days)
  const dailyEnrollments: Record<string, number> = {};
  for (const e of enrollments) {
    const day = e.enrolled_at.slice(0, 10);
    dailyEnrollments[day] = (dailyEnrollments[day] ?? 0) + 1;
  }

  // A/B(/C) variant analytics — uses step_log.ab_variant (per-step tracking),
  // NOT enrollment.ab_variant (which is for condition-level ab_split only).
  const hasAB = steps.some((s) => s.variant_b_template);
  let ab_stats: Record<string, unknown> | null = null;
  if (hasAB) {
    // Per-step variant sent counts from logs
    const stepVariantStats: Record<string, { a_sent: number; b_sent: number; c_sent?: number }> = {};
    // Track which enrollments got A vs B vs C (from their first A/B step log)
    const enrollmentVariant = new Map<string, string>();
    for (const log of stepLogs) {
      if (log.ab_variant) {
        if (!stepVariantStats[log.step_id]) stepVariantStats[log.step_id] = { a_sent: 0, b_sent: 0 };
        if (log.ab_variant === "A") stepVariantStats[log.step_id].a_sent++;
        else if (log.ab_variant === "B") stepVariantStats[log.step_id].b_sent++;
        else if (log.ab_variant === "C") {
          if (stepVariantStats[log.step_id].c_sent === undefined) stepVariantStats[log.step_id].c_sent = 0;
          stepVariantStats[log.step_id].c_sent!++;
        }
        // First variant assignment wins for enrollment-level reply attribution
        if (!enrollmentVariant.has(log.enrollment_id)) {
          enrollmentVariant.set(log.enrollment_id, log.ab_variant);
        }
      }
    }

    let aTotal = 0, bTotal = 0, cTotal = 0, aReplied = 0, bReplied = 0, cReplied = 0;
    for (const [eid, variant] of enrollmentVariant) {
      const enrollment = enrollmentMap.get(eid);
      if (!enrollment) continue;
      if (variant === "A") { aTotal++; if (enrollment.reply_count > 0) aReplied++; }
      else if (variant === "B") { bTotal++; if (enrollment.reply_count > 0) bReplied++; }
      else if (variant === "C") { cTotal++; if (enrollment.reply_count > 0) cReplied++; }
    }

    // Statistical significance (z-test for two proportions: A vs B)
    let significance: { z_score: number; significant: boolean; min_sample: boolean } | null = null;
    if (aTotal >= 5 && bTotal >= 5) {
      const p1 = aTotal > 0 ? aReplied / aTotal : 0;
      const p2 = bTotal > 0 ? bReplied / bTotal : 0;
      const pooled = (aReplied + bReplied) / (aTotal + bTotal);
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / aTotal + 1 / bTotal));
      const z = se > 0 ? Math.abs(p1 - p2) / se : 0;
      significance = {
        z_score: Math.round(z * 100) / 100,
        significant: z > 1.96,
        min_sample: aTotal < 30 || bTotal < 30,
      };
    }

    ab_stats = {
      variant_a: {
        total: aTotal,
        replied: aReplied,
        reply_rate: aTotal > 0 ? Math.round((aReplied / aTotal) * 100) : 0,
      },
      variant_b: {
        total: bTotal,
        replied: bReplied,
        reply_rate: bTotal > 0 ? Math.round((bReplied / bTotal) * 100) : 0,
      },
      step_variants: stepVariantStats,
      significance,
    };

    // Add variant C stats if present
    if (cTotal > 0) {
      (ab_stats as Record<string, unknown>).variant_c = {
        total: cTotal,
        replied: cReplied,
        reply_rate: cTotal > 0 ? Math.round((cReplied / cTotal) * 100) : 0,
      };
    }
  }

  return NextResponse.json({
    sequence,
    total,
    replied,
    reply_rate: total > 0 ? Math.round((replied / total) * 100) : 0,
    completion_rate: total > 0 ? Math.round(((statusCounts.completed ?? 0) / total) * 100) : 0,
    status_counts: statusCounts,
    step_stats: stepStats,
    ab_stats,
    daily_enrollments: Object.entries(dailyEnrollments)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30),
  });
}
