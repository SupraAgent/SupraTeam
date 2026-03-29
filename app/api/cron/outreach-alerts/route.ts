/**
 * GET /api/cron/outreach-alerts
 * Cron endpoint to generate alerts for underperforming outreach sequences.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Fetch active sequences
  const { data: sequences, error: seqError } = await supabase
    .from("crm_outreach_sequences")
    .select("id, name, status, updated_at")
    .in("status", ["active", "paused"]);

  if (seqError || !sequences) {
    return NextResponse.json({ error: seqError?.message ?? "Failed to fetch sequences" }, { status: 500 });
  }

  // Fetch all enrollments for these sequences
  const seqIds = sequences.map((s) => s.id);
  if (seqIds.length === 0) {
    return NextResponse.json({ alerts_created: 0 });
  }

  const { data: enrollments } = await supabase
    .from("crm_outreach_enrollments")
    .select("id, sequence_id, status, reply_count, current_step, enrolled_at")
    .in("sequence_id", seqIds);

  // Fetch existing undismissed alerts to avoid duplicates
  const { data: existingAlerts } = await supabase
    .from("crm_outreach_alerts")
    .select("sequence_id, alert_type")
    .eq("dismissed", false)
    .in("sequence_id", seqIds);

  const existingSet = new Set(
    (existingAlerts ?? []).map((a) => `${a.sequence_id}:${a.alert_type}`)
  );

  // Fetch step logs for drop-off analysis
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  interface StepLogEntry {
    enrollment_id: string;
    step_id: string;
    status: string;
  }
  let stepLogs: StepLogEntry[] = [];
  if (enrollmentIds.length > 0) {
    const { data } = await supabase
      .from("crm_outreach_step_log")
      .select("enrollment_id, step_id, status")
      .in("enrollment_id", enrollmentIds);
    stepLogs = (data ?? []) as StepLogEntry[];
  }

  // Fetch steps for each sequence (for drop-off analysis)
  const { data: allSteps } = await supabase
    .from("crm_outreach_steps")
    .select("id, sequence_id, step_number, step_type")
    .in("sequence_id", seqIds)
    .eq("step_type", "message")
    .order("step_number");

  const alertsToCreate: Array<{ sequence_id: string; alert_type: string; message: string }> = [];

  for (const seq of sequences) {
    const seqEnrollments = (enrollments ?? []).filter((e) => e.sequence_id === seq.id);
    const total = seqEnrollments.length;

    if (total < 10) continue; // Skip sequences with <10 enrollments

    const replied = seqEnrollments.filter((e) => e.reply_count > 0).length;
    const replyRate = Math.round((replied / total) * 100);

    // Low reply rate check
    if (replyRate < 10 && !existingSet.has(`${seq.id}:low_reply_rate`)) {
      alertsToCreate.push({
        sequence_id: seq.id,
        alert_type: "low_reply_rate",
        message: `"${seq.name}" has a ${replyRate}% reply rate (${replied}/${total}). Consider rewriting messages or adjusting timing.`,
      });
    }

    // High drop-off check
    const seqSteps = (allSteps ?? []).filter((s) => s.sequence_id === seq.id).sort((a, b) => a.step_number - b.step_number);
    if (seqSteps.length >= 2) {
      const sentByStep = new Map<string, number>();
      for (const log of stepLogs) {
        if (log.status === "sent") {
          sentByStep.set(log.step_id, (sentByStep.get(log.step_id) ?? 0) + 1);
        }
      }

      for (let i = 1; i < seqSteps.length; i++) {
        const prevSent = sentByStep.get(seqSteps[i - 1].id) ?? 0;
        const currSent = sentByStep.get(seqSteps[i].id) ?? 0;
        if (prevSent > 0) {
          const dropoff = Math.round(((prevSent - currSent) / prevSent) * 100);
          if (dropoff > 50 && !existingSet.has(`${seq.id}:high_drop_off`)) {
            alertsToCreate.push({
              sequence_id: seq.id,
              alert_type: "high_drop_off",
              message: `"${seq.name}" step ${seqSteps[i].step_number} has ${dropoff}% drop-off from step ${seqSteps[i - 1].step_number}. Review timing or message content.`,
            });
            break; // One alert per sequence
          }
        }
      }
    }

    // Stale sequence check
    const latestEnrollment = seqEnrollments
      .map((e) => new Date(e.enrolled_at).getTime())
      .sort((a, b) => b - a)[0];

    if (latestEnrollment) {
      const daysSinceLastEnrollment = (Date.now() - latestEnrollment) / (1000 * 60 * 60 * 24);
      if (daysSinceLastEnrollment > 14 && !existingSet.has(`${seq.id}:stale_sequence`)) {
        alertsToCreate.push({
          sequence_id: seq.id,
          alert_type: "stale_sequence",
          message: `"${seq.name}" has had no new enrollments in ${Math.floor(daysSinceLastEnrollment)} days. Consider updating or archiving.`,
        });
      }
    }
  }

  // Insert alerts
  let created = 0;
  if (alertsToCreate.length > 0) {
    const { error: insertError } = await supabase
      .from("crm_outreach_alerts")
      .insert(alertsToCreate);

    if (insertError) {
      console.error("[cron/outreach-alerts] insert error:", insertError);
    } else {
      created = alertsToCreate.length;
    }
  }

  return NextResponse.json({ alerts_created: created });
}
