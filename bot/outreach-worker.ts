/**
 * TG Outreach Sequence Worker
 * Processes due outreach enrollments: sends messages, evaluates conditions, advances steps.
 * Runs on an interval inside the bot process.
 */

import type { Bot } from "grammy";
import { supabase } from "./lib/supabase.js";
import { renderTemplate, buildOutreachVars } from "../lib/outreach-templates.js";

type Enrollment = {
  id: string;
  sequence_id: string;
  deal_id: string | null;
  contact_id: string | null;
  tg_chat_id: string;
  current_step: number;
  status: string;
  next_send_at: string;
  last_reply_at: string | null;
  reply_count: number;
  enrolled_at: string;
};

type Step = {
  id: string;
  sequence_id: string;
  step_number: number;
  step_type: string; // 'message' | 'wait' | 'condition'
  delay_hours: number;
  message_template: string;
  condition_type: string | null;
  condition_config: Record<string, unknown> | null;
  on_true_step: number | null;
  on_false_step: number | null;
};

const POLL_INTERVAL_MS = 60_000; // 1 minute
let isProcessing = false;

async function processEnrollments(bot: Bot) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    await doProcessEnrollments(bot);
  } finally {
    isProcessing = false;
  }
}

async function doProcessEnrollments(bot: Bot) {
  try {
    // Find due enrollments
    const { data: enrollments, error } = await supabase
      .from("crm_outreach_enrollments")
      .select("*")
      .eq("status", "active")
      .lte("next_send_at", new Date().toISOString())
      .limit(20);

    if (error || !enrollments || enrollments.length === 0) return;

    for (const enrollment of enrollments as Enrollment[]) {
      await processEnrollment(bot, enrollment);
    }
  } catch (err) {
    console.error("[outreach-worker] poll error:", err);
  }
}

async function processEnrollment(bot: Bot, enrollment: Enrollment) {
  try {
    // Fetch all steps for this sequence
    const { data: steps } = await supabase
      .from("crm_outreach_steps")
      .select("*")
      .eq("sequence_id", enrollment.sequence_id)
      .order("step_number");

    if (!steps || steps.length === 0) {
      await markCompleted(enrollment.id);
      return;
    }

    const currentStep = (steps as Step[]).find((s) => s.step_number === enrollment.current_step);
    if (!currentStep) {
      await markCompleted(enrollment.id);
      return;
    }

    // Fetch deal + contact data for template rendering
    const vars = await fetchTemplateVars(enrollment);

    if (currentStep.step_type === "message") {
      // Send the message
      const text = renderTemplate(currentStep.message_template, vars);
      const chatId = Number(enrollment.tg_chat_id);

      try {
        await bot.api.sendMessage(chatId, text);
      } catch (sendErr) {
        console.error(`[outreach-worker] send failed for enrollment ${enrollment.id}:`, sendErr);
        // Log the failure
        await supabase.from("crm_outreach_step_log").insert({
          enrollment_id: enrollment.id,
          step_id: currentStep.id,
          status: "failed",
          error: sendErr instanceof Error ? sendErr.message : "Send failed",
        });
        return; // Don't advance, retry next poll
      }

      // Log success
      await supabase.from("crm_outreach_step_log").insert({
        enrollment_id: enrollment.id,
        step_id: currentStep.id,
        status: "sent",
      });

      // Advance to next step
      await advanceToNextStep(enrollment, steps as Step[], currentStep.step_number);

    } else if (currentStep.step_type === "condition") {
      // Evaluate condition
      const conditionMet = await evaluateCondition(currentStep, enrollment);

      const targetStep = conditionMet ? currentStep.on_true_step : currentStep.on_false_step;

      if (targetStep == null) {
        // No target = end sequence
        await markCompleted(enrollment.id);
        return;
      }

      // Jump to target step
      const target = (steps as Step[]).find((s) => s.step_number === targetStep);
      if (!target) {
        await markCompleted(enrollment.id);
        return;
      }

      await supabase.from("crm_outreach_enrollments").update({
        current_step: targetStep,
        next_send_at: new Date(Date.now() + (target.delay_hours || 0) * 3600000).toISOString(),
      }).eq("id", enrollment.id);

      // Log condition evaluation
      await supabase.from("crm_outreach_step_log").insert({
        enrollment_id: enrollment.id,
        step_id: currentStep.id,
        status: "evaluated",
        metadata: { condition_type: currentStep.condition_type, result: conditionMet, target_step: targetStep },
      });

    } else if (currentStep.step_type === "wait") {
      // Just advance past the wait step
      await advanceToNextStep(enrollment, steps as Step[], currentStep.step_number);
    }
  } catch (err) {
    console.error(`[outreach-worker] error processing enrollment ${enrollment.id}:`, err);
  }
}

async function evaluateCondition(step: Step, enrollment: Enrollment): Promise<boolean> {
  const condType = step.condition_type || step.condition_config?.check as string;

  switch (condType) {
    case "reply_received":
      return enrollment.last_reply_at != null && enrollment.reply_count > 0;

    case "no_reply_timeout": {
      const timeoutHours = (step.condition_config?.timeout_hours as number) || step.delay_hours || 24;
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

    case "deal_stage": {
      if (!enrollment.deal_id) return false;
      const targetStageId = step.condition_config?.stage_id as string;
      if (!targetStageId) return false;
      const { data: deal } = await supabase
        .from("crm_deals")
        .select("stage_id")
        .eq("id", enrollment.deal_id)
        .single();
      return deal?.stage_id === targetStageId;
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

  await supabase.from("crm_outreach_enrollments").update({
    current_step: nextStep.step_number,
    next_send_at: new Date(Date.now() + (nextStep.delay_hours || 0) * 3600000).toISOString(),
  }).eq("id", enrollment.id);
}

async function markCompleted(enrollmentId: string) {
  await supabase.from("crm_outreach_enrollments").update({
    status: "completed",
  }).eq("id", enrollmentId);
}

async function fetchTemplateVars(enrollment: Enrollment): Promise<Record<string, string>> {
  let contactName: string | null = null;
  let dealName: string | null = null;
  let stage: string | null = null;
  let company: string | null = null;
  let value: number | null = null;

  if (enrollment.deal_id) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("deal_name, value, stage:pipeline_stages(name), contact:crm_contacts(name, company)")
      .eq("id", enrollment.deal_id)
      .single();

    if (deal) {
      dealName = deal.deal_name;
      value = deal.value as number | null;
      stage = (deal.stage as unknown as { name: string } | null)?.name ?? null;
      const contact = deal.contact as unknown as { name: string; company: string } | null;
      contactName = contact?.name ?? null;
      company = contact?.company ?? null;
    }
  }

  if (!contactName && enrollment.contact_id) {
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

  return buildOutreachVars({
    contact_name: contactName,
    deal_name: dealName,
    stage,
    company,
    value,
  });
}

export function startOutreachWorker(bot: Bot) {
  console.warn("[outreach-worker] Starting TG outreach worker...");

  // Initial run after 10 seconds
  setTimeout(() => processEnrollments(bot), 10_000);

  // Then poll every minute
  setInterval(() => processEnrollments(bot), POLL_INTERVAL_MS);
}
