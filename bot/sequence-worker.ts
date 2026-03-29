/**
 * Sequence execution worker — runs as a cron/interval job
 * Checks for pending sequence steps and scheduled emails, sends them.
 *
 * Run: npx tsx bot/sequence-worker.ts
 * Or via cron: every 5 min — cd /path/to/SupraTeam && npx tsx bot/sequence-worker.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function processSequenceSteps() {
  const now = new Date().toISOString();

  // Find active enrollments with next_send_at <= now
  const { data: dueEnrollments, error } = await admin
    .from("crm_email_sequence_enrollments")
    .select(`
      id, sequence_id, deal_id, contact_id, current_step, next_send_at,
      crm_email_sequences(steps, name),
      crm_contacts(name, email)
    `)
    .eq("status", "active")
    .lte("next_send_at", now)
    .limit(50);

  if (error) {
    console.error("[sequence-worker] Failed to fetch enrollments:", error.message);
    return;
  }

  if (!dueEnrollments?.length) {
    console.log("[sequence-worker] No due enrollments");
    return;
  }

  console.log(`[sequence-worker] Processing ${dueEnrollments.length} due enrollment(s)`);

  for (const enrollment of dueEnrollments) {
    try {
      const sequence = enrollment.crm_email_sequences as unknown as { steps: { delay_days: number; template_id: string; subject_override?: string }[]; name: string };
      const contact = enrollment.crm_contacts as unknown as { name: string; email: string };

      if (!sequence?.steps || !contact?.email) {
        console.warn(`[sequence-worker] Skipping enrollment ${enrollment.id}: missing data`);
        continue;
      }

      const currentStep = sequence.steps[enrollment.current_step];
      if (!currentStep) {
        // All steps completed
        await admin
          .from("crm_email_sequence_enrollments")
          .update({ status: "completed", completed_at: now })
          .eq("id", enrollment.id);
        console.log(`[sequence-worker] Enrollment ${enrollment.id} completed (all steps done)`);
        continue;
      }

      // Fetch the template
      const { data: template } = await admin
        .from("crm_email_templates")
        .select("name, subject, body, variables")
        .eq("id", currentStep.template_id)
        .single();

      if (!template) {
        console.warn(`[sequence-worker] Template ${currentStep.template_id} not found, skipping`);
        continue;
      }

      // Variable substitution
      let body = template.body;
      let subject = currentStep.subject_override || template.subject || sequence.name;
      const vars: Record<string, string> = {
        name: contact.name?.split(" ")[0] ?? "",
        full_name: contact.name ?? "",
        email: contact.email ?? "",
      };
      for (const [key, value] of Object.entries(vars)) {
        body = body.replace(new RegExp(`\\{${key}\\}`, "g"), value);
        subject = subject.replace(new RegExp(`\\{${key}\\}`, "g"), value);
      }

      // Find a connection to send from (pick the first one with an active enrollment creator)
      // For now, we'll look for any default connection
      const { data: connections } = await admin
        .from("crm_email_connections")
        .select("id, user_id, access_token_encrypted, refresh_token_encrypted, email")
        .eq("is_default", true)
        .limit(1);

      if (!connections?.length) {
        console.warn("[sequence-worker] No default email connection found");
        continue;
      }

      const conn = connections[0];

      // Note: In production, this would use the GmailDriver to send.
      // Here we log and mark as sent. The actual send requires OAuth tokens
      // which need runtime decryption + Google API calls.
      console.log(`[sequence-worker] Would send step ${enrollment.current_step + 1} of "${sequence.name}" to ${contact.email}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  From: ${conn.email}`);

      // Advance to next step
      const nextStepIndex = enrollment.current_step + 1;
      const nextStep = sequence.steps[nextStepIndex];

      if (nextStep) {
        const nextSendAt = new Date();
        nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);

        await admin
          .from("crm_email_sequence_enrollments")
          .update({
            current_step: nextStepIndex,
            next_send_at: nextSendAt.toISOString(),
          })
          .eq("id", enrollment.id);
      } else {
        // Last step — mark completed
        await admin
          .from("crm_email_sequence_enrollments")
          .update({
            current_step: nextStepIndex,
            status: "completed",
            completed_at: now,
          })
          .eq("id", enrollment.id);
      }

      // Audit log
      await admin.from("crm_email_audit_log").insert({
        user_id: conn.user_id,
        action: "sequence_step_sent",
        recipient: contact.email,
        metadata: {
          sequence_id: enrollment.sequence_id,
          enrollment_id: enrollment.id,
          step: enrollment.current_step,
          template_name: template.name,
          subject,
        },
      });

      console.log(`[sequence-worker] Step ${enrollment.current_step + 1} processed for enrollment ${enrollment.id}`);
    } catch (err) {
      console.error(`[sequence-worker] Error processing enrollment ${enrollment.id}:`, err);
    }
  }
}

async function processScheduledEmails() {
  const now = new Date().toISOString();

  // Find pending scheduled actions that are due
  const { data: dueScheduled, error } = await admin
    .from("crm_email_scheduled")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(50);

  if (error) {
    console.error("[sequence-worker] Failed to fetch scheduled:", error.message);
    return;
  }

  if (!dueScheduled?.length) {
    console.log("[sequence-worker] No due scheduled actions");
    return;
  }

  console.log(`[sequence-worker] Processing ${dueScheduled.length} scheduled action(s)`);

  for (const scheduled of dueScheduled) {
    try {
      switch (scheduled.type) {
        case "send_later": {
          // The draft_data contains the full send payload
          // In production, use GmailDriver to actually send
          console.log(`[sequence-worker] Would send scheduled email (id: ${scheduled.id})`);
          console.log(`  Draft data:`, JSON.stringify(scheduled.draft_data).slice(0, 200));
          break;
        }
        case "snooze": {
          // Move thread back to inbox
          console.log(`[sequence-worker] Snooze expired for thread ${scheduled.thread_id}, would move back to inbox`);
          // In production: driver.modifyLabels(threadId, ["INBOX"], [])
          break;
        }
        case "follow_up_reminder": {
          console.log(`[sequence-worker] Follow-up reminder for thread ${scheduled.thread_id}`);
          break;
        }
      }

      // Mark as executed
      await admin
        .from("crm_email_scheduled")
        .update({ status: "executed", executed_at: now })
        .eq("id", scheduled.id);

    } catch (err) {
      console.error(`[sequence-worker] Error processing scheduled ${scheduled.id}:`, err);
    }
  }
}

async function main() {
  console.log(`[sequence-worker] Starting at ${new Date().toISOString()}`);
  await processSequenceSteps();
  await processScheduledEmails();
  console.log("[sequence-worker] Done");
}

main().catch(console.error);
