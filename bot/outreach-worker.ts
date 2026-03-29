/**
 * TG Outreach Sequence Worker
 * Processes due outreach enrollments: sends messages, evaluates conditions, advances steps.
 * Runs on an interval inside the bot process.
 */

import type { Bot } from "grammy";
import { supabase } from "./lib/supabase.js";
import { renderTemplate, buildOutreachVars } from "../lib/outreach-templates.js";
import { getOptimalSendTime } from "./lib/send-time-optimizer.js";

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
  ab_variant: string | null;
  enrolled_at: string;
};

type Step = {
  id: string;
  sequence_id: string;
  step_number: number;
  step_type: string; // 'message' | 'wait' | 'condition'
  delay_hours: number;
  message_template: string;
  variant_b_template: string | null;
  variant_c_template: string | null;
  ab_split_pct: number | null;
  variant_b_delay_hours: number | null;
  step_label: string | null;
  condition_type: string | null;
  condition_config: Record<string, unknown> | null;
  on_true_step: number | null;
  on_false_step: number | null;
  split_percentage: number | null;
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
      // A/B(/C) variant selection: per-step random assignment, tracked in step_log only.
      // This is independent of enrollment.ab_variant which is used by condition-level ab_split.
      let abVariant: string | null = null;
      let template = currentStep.message_template;

      if (currentStep.variant_b_template) {
        const splitPct = currentStep.ab_split_pct ?? 50;
        const rand = Math.random() * 100;

        if (currentStep.variant_c_template) {
          // 3-way split: A gets splitPct%, remaining split evenly between B and C
          const remaining = 100 - splitPct;
          const bThreshold = splitPct + remaining / 2;
          if (rand < splitPct) {
            abVariant = "A";
            template = currentStep.message_template;
          } else if (rand < bThreshold) {
            abVariant = "B";
            template = currentStep.variant_b_template;
          } else {
            abVariant = "C";
            template = currentStep.variant_c_template;
          }
        } else {
          // 2-way split: A gets splitPct%
          abVariant = rand < splitPct ? "A" : "B";
          template = abVariant === "B" ? currentStep.variant_b_template : currentStep.message_template;
        }
      }

      const text = renderTemplate(template, vars);
      const chatId = Number(enrollment.tg_chat_id);

      try {
        await bot.api.sendMessage(chatId, text);
      } catch (sendErr) {
        console.error(`[outreach-worker] send failed for enrollment ${enrollment.id}:`, sendErr);
        await supabase.from("crm_outreach_step_log").insert({
          enrollment_id: enrollment.id,
          step_id: currentStep.id,
          status: "failed",
          error: sendErr instanceof Error ? sendErr.message : "Send failed",
          ab_variant: abVariant,
        });
        return; // Don't advance, retry next poll
      }

      // Log success with variant info
      await supabase.from("crm_outreach_step_log").insert({
        enrollment_id: enrollment.id,
        step_id: currentStep.id,
        status: "sent",
        ab_variant: abVariant,
      });

      // Auto-winner check: if both variants have 20+ sends and reply rate diff > 10pp
      if (abVariant && currentStep.variant_b_template) {
        await checkAutoWinner(currentStep);
      }

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

    case "message_keyword": {
      // Check if any recent reply contains specific keywords
      const keywords = (step.condition_config?.keywords as string[]) ?? [];
      if (keywords.length === 0 || !enrollment.tg_chat_id) return false;
      const { data: messages } = await supabase
        .from("tg_group_messages")
        .select("message_text")
        .eq("telegram_chat_id", enrollment.tg_chat_id)
        .eq("is_from_bot", false)
        .order("sent_at", { ascending: false })
        .limit(10);
      if (!messages || messages.length === 0) return false;
      const allText = messages.map((m) => (m.message_text ?? "").toLowerCase()).join(" ");
      return keywords.some((kw) => allText.includes(kw.toLowerCase()));
    }

    case "days_since_enroll": {
      const threshold = (step.condition_config?.days as number) ?? 7;
      const enrolledAt = new Date(enrollment.enrolled_at).getTime();
      const daysSince = (Date.now() - enrolledAt) / 86400000;
      return daysSince >= threshold;
    }

    case "ab_split": {
      // Randomly assign A or B based on split_percentage (% that goes to true branch)
      const splitPct = step.split_percentage ?? 50;
      const isA = Math.random() * 100 < splitPct;
      // Persist the variant assignment
      await supabase.from("crm_outreach_enrollments").update({
        ab_variant: isA ? "A" : "B",
      }).eq("id", enrollment.id);
      return isA;
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

  // Check if enrollment was assigned variant B (from most recent step_log) for timing override
  let effectiveDelayHours = nextStep.delay_hours;
  if (nextStep.variant_b_delay_hours != null) {
    const { data: recentLog } = await supabase
      .from("crm_outreach_step_log")
      .select("ab_variant")
      .eq("enrollment_id", enrollment.id)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentLog?.ab_variant === "B") {
      effectiveDelayHours = nextStep.variant_b_delay_hours;
    }
  }

  // Use send-time optimization for message steps with delay > 1 hour
  let nextSendAt: string;
  if (nextStep.step_type === "message" && effectiveDelayHours >= 1) {
    // Resolve tg_group_id from telegram_chat_id for optimization lookup
    const { data: group } = await supabase
      .from("tg_groups")
      .select("id")
      .eq("telegram_group_id", Number(enrollment.tg_chat_id))
      .maybeSingle();
    nextSendAt = await getOptimalSendTime(group?.id ?? null, effectiveDelayHours);
  } else {
    nextSendAt = new Date(Date.now() + (effectiveDelayHours || 0) * 3600000).toISOString();
  }

  await supabase.from("crm_outreach_enrollments").update({
    current_step: nextStep.step_number,
    next_send_at: nextSendAt,
  }).eq("id", enrollment.id);
}

async function markCompleted(enrollmentId: string) {
  await supabase.from("crm_outreach_enrollments").update({
    status: "completed",
  }).eq("id", enrollmentId);

  // Fire sequence.completed webhook (non-blocking)
  try {
    const { dispatchWebhook } = await import("../lib/webhooks");
    dispatchWebhook("sequence.completed", {
      enrollment_id: enrollmentId,
      type: "outreach",
    }).catch(() => {});
  } catch { /* ignore */ }
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

async function checkAutoWinner(step: Step) {
  try {
    // Get all step_log entries for this step
    const { data: logs } = await supabase
      .from("crm_outreach_step_log")
      .select("enrollment_id, ab_variant, status")
      .eq("step_id", step.id)
      .eq("status", "sent");

    if (!logs || logs.length === 0) return;

    const aSent = logs.filter((l) => l.ab_variant === "A").length;
    const bSent = logs.filter((l) => l.ab_variant === "B").length;

    // Need 20+ per variant
    if (aSent < 20 || bSent < 20) return;

    // Get enrollment reply counts for each variant
    const aEnrollmentIds = [...new Set(logs.filter((l) => l.ab_variant === "A").map((l) => l.enrollment_id))];
    const bEnrollmentIds = [...new Set(logs.filter((l) => l.ab_variant === "B").map((l) => l.enrollment_id))];

    const { data: aEnrollments } = await supabase
      .from("crm_outreach_enrollments")
      .select("reply_count")
      .in("id", aEnrollmentIds);
    const { data: bEnrollments } = await supabase
      .from("crm_outreach_enrollments")
      .select("reply_count")
      .in("id", bEnrollmentIds);

    const aReplied = (aEnrollments ?? []).filter((e) => e.reply_count > 0).length;
    const bReplied = (bEnrollments ?? []).filter((e) => e.reply_count > 0).length;

    const aReplyRate = aReplied / aEnrollmentIds.length * 100;
    const bReplyRate = bReplied / bEnrollmentIds.length * 100;

    const diff = Math.abs(aReplyRate - bReplyRate);
    if (diff <= 10) return; // Not enough difference

    const winner = aReplyRate > bReplyRate ? "A" : "B";

    // Apply auto-winner
    const updates: Record<string, unknown> = { variant_b_template: null };
    if (winner === "B") {
      updates.message_template = step.variant_b_template;
    }
    updates.step_label = `${step.step_label ?? `Step ${step.step_number}`} (auto-optimized: ${winner} won)`;

    await supabase
      .from("crm_outreach_steps")
      .update(updates)
      .eq("id", step.id);

    // Log auto-winner event
    await supabase.from("crm_outreach_step_log").insert({
      enrollment_id: "00000000-0000-0000-0000-000000000000", // sentinel for system events
      step_id: step.id,
      status: "auto_winner",
      ab_variant: winner,
      metadata: {
        a_sent: aSent,
        b_sent: bSent,
        a_reply_rate: Math.round(aReplyRate),
        b_reply_rate: Math.round(bReplyRate),
        winner,
      },
    });

    console.warn(`[outreach-worker] Auto-winner selected for step ${step.id}: Variant ${winner} (A: ${Math.round(aReplyRate)}%, B: ${Math.round(bReplyRate)}%)`);
  } catch (err) {
    console.error("[outreach-worker] auto-winner check error:", err);
  }
}

export function startOutreachWorker(bot: Bot) {
  console.warn("[outreach-worker] Starting TG outreach worker...");

  // Initial run after 10 seconds
  setTimeout(() => processEnrollments(bot), 10_000);

  // Then poll every minute
  setInterval(() => processEnrollments(bot), POLL_INTERVAL_MS);
}
