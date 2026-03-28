/**
 * Bot Drip Sequence Worker
 * Processes active drip enrollments: sends messages, evaluates conditions, advances steps.
 * Runs alongside outreach-worker on 60s poll.
 *
 * Key difference from outreach: drips are bot-initiated (triggered by TG events),
 * not manually enrolled by reps.
 */

import type { Bot } from "grammy";
import { supabase } from "./lib/supabase.js";
import { renderTemplate, buildOutreachVars } from "../lib/outreach-templates.js";
import { getOptimalSendTime } from "./lib/send-time-optimizer.js";

interface Enrollment {
  id: string;
  sequence_id: string;
  tg_user_id: number;
  tg_chat_id: number;
  contact_id: string | null;
  deal_id: string | null;
  current_step: number;
  status: string;
  next_send_at: string;
  last_reply_at: string | null;
  reply_count: number;
}

interface Step {
  id: string;
  sequence_id: string;
  step_number: number;
  step_type: string;
  delay_hours: number;
  message_template: string;
  condition_type: string | null;
  condition_config: Record<string, unknown> | null;
  on_true_step: number | null;
  on_false_step: number | null;
}

const POLL_INTERVAL_MS = 60_000;
let isProcessing = false;

async function processEnrollments(bot: Bot) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const { data: enrollments, error } = await supabase
      .from("crm_drip_enrollments")
      .select("*")
      .eq("status", "active")
      .lte("next_send_at", new Date().toISOString())
      .limit(20);

    if (error || !enrollments || enrollments.length === 0) return;

    // Batch-fetch steps for all sequences
    const seqIds = [...new Set(enrollments.map((e) => e.sequence_id))];
    const { data: allSteps } = await supabase
      .from("crm_drip_steps")
      .select("*")
      .in("sequence_id", seqIds)
      .order("step_number");

    const stepsBySeq = new Map<string, Step[]>();
    for (const step of (allSteps ?? []) as Step[]) {
      const list = stepsBySeq.get(step.sequence_id) ?? [];
      list.push(step);
      stepsBySeq.set(step.sequence_id, list);
    }

    for (const enrollment of enrollments as Enrollment[]) {
      const steps = stepsBySeq.get(enrollment.sequence_id) ?? [];
      await processEnrollment(bot, enrollment, steps);
    }
  } catch (err) {
    console.error("[drip-worker] poll error:", err);
  } finally {
    isProcessing = false;
  }
}

async function processEnrollment(bot: Bot, enrollment: Enrollment, steps: Step[]) {
  try {
    if (steps.length === 0) {
      await markCompleted(enrollment.id);
      return;
    }

    const currentStep = steps.find((s) => s.step_number === enrollment.current_step);
    if (!currentStep) {
      await markCompleted(enrollment.id);
      return;
    }

    if (currentStep.step_type === "message") {
      const vars = await fetchVars(enrollment);
      const text = renderTemplate(currentStep.message_template, vars);

      try {
        await bot.api.sendMessage(enrollment.tg_chat_id, text);
      } catch (sendErr) {
        console.error(`[drip-worker] send failed for ${enrollment.id}:`, sendErr);
        await supabase.from("crm_drip_step_log").insert({
          enrollment_id: enrollment.id,
          step_id: currentStep.id,
          status: "failed",
          error: sendErr instanceof Error ? sendErr.message : "Send failed",
        });
        return;
      }

      await supabase.from("crm_drip_step_log").insert({
        enrollment_id: enrollment.id,
        step_id: currentStep.id,
        status: "sent",
      });

      await advanceToNextStep(enrollment, steps, currentStep.step_number);

    } else if (currentStep.step_type === "condition") {
      const conditionMet = await evaluateCondition(currentStep, enrollment);
      const targetStep = conditionMet ? currentStep.on_true_step : currentStep.on_false_step;

      if (targetStep == null) {
        await markCompleted(enrollment.id);
        return;
      }

      const target = steps.find((s) => s.step_number === targetStep);
      if (!target) {
        await markCompleted(enrollment.id);
        return;
      }

      await supabase.from("crm_drip_enrollments").update({
        current_step: targetStep,
        next_send_at: new Date(Date.now() + (target.delay_hours || 0) * 3600000).toISOString(),
      }).eq("id", enrollment.id);

      await supabase.from("crm_drip_step_log").insert({
        enrollment_id: enrollment.id,
        step_id: currentStep.id,
        status: "evaluated",
        metadata: { condition_type: currentStep.condition_type, result: conditionMet, target_step: targetStep },
      });

    } else if (currentStep.step_type === "wait") {
      await advanceToNextStep(enrollment, steps, currentStep.step_number);
    }
  } catch (err) {
    console.error(`[drip-worker] error processing ${enrollment.id}:`, err);
  }
}

async function evaluateCondition(step: Step, enrollment: Enrollment): Promise<boolean> {
  const condType = step.condition_type;

  switch (condType) {
    case "reply_received":
      return enrollment.reply_count > 0;

    case "no_reply_timeout": {
      const timeoutHours = (step.condition_config?.timeout_hours as number) || 24;
      const cutoff = new Date(Date.now() - timeoutHours * 3600000);
      return !enrollment.last_reply_at || new Date(enrollment.last_reply_at) < cutoff;
    }

    case "engagement_score": {
      if (!enrollment.contact_id) return false;
      const threshold = (step.condition_config?.threshold as number) ?? 50;
      const { data: contact } = await supabase
        .from("crm_contacts")
        .select("engagement_score")
        .eq("id", enrollment.contact_id)
        .single();
      return (contact?.engagement_score ?? 0) >= threshold;
    }

    default:
      return false;
  }
}

async function advanceToNextStep(enrollment: Enrollment, steps: Step[], currentStepNumber: number) {
  const nextStep = steps.find((s) => s.step_number === currentStepNumber + 1);
  if (!nextStep) {
    await markCompleted(enrollment.id);
    return;
  }

  // Use send-time optimization for message steps with delay > 1 hour
  let nextSendAt: string;
  if (nextStep.step_type === "message" && (nextStep.delay_hours ?? 0) >= 1) {
    const { data: group } = await supabase
      .from("tg_groups")
      .select("id")
      .eq("telegram_group_id", enrollment.tg_chat_id)
      .maybeSingle();
    nextSendAt = await getOptimalSendTime(group?.id ?? null, nextStep.delay_hours);
  } else {
    nextSendAt = new Date(Date.now() + (nextStep.delay_hours || 0) * 3600000).toISOString();
  }

  await supabase.from("crm_drip_enrollments").update({
    current_step: nextStep.step_number,
    next_send_at: nextSendAt,
  }).eq("id", enrollment.id);
}

async function markCompleted(enrollmentId: string) {
  await supabase.from("crm_drip_enrollments").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", enrollmentId);

  // Fire sequence.completed webhook (non-blocking)
  try {
    const { dispatchWebhook } = await import("../lib/webhooks");
    dispatchWebhook("sequence.completed", {
      enrollment_id: enrollmentId,
      type: "drip",
    }).catch(() => {});
  } catch { /* ignore */ }
}

async function fetchVars(enrollment: Enrollment): Promise<Record<string, string>> {
  let contactName: string | null = null;
  let dealName: string | null = null;
  let stage: string | null = null;
  let company: string | null = null;
  let value: number | null = null;

  if (enrollment.contact_id) {
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("name, company")
      .eq("id", enrollment.contact_id)
      .single();
    if (contact) {
      contactName = contact.name;
      company = contact.company;
    }
  }

  if (enrollment.deal_id) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("deal_name, value, stage:pipeline_stages(name)")
      .eq("id", enrollment.deal_id)
      .single();
    if (deal) {
      dealName = deal.deal_name;
      value = deal.value as number | null;
      stage = (deal.stage as unknown as { name: string } | null)?.name ?? null;
    }
  }

  return buildOutreachVars({ contact_name: contactName, deal_name: dealName, stage, company, value });
}

export function startDripWorker(bot: Bot) {
  console.warn("[drip-worker] Starting bot drip sequence worker...");
  setTimeout(() => processEnrollments(bot), 15_000);
  setInterval(() => processEnrollments(bot), POLL_INTERVAL_MS);
}
