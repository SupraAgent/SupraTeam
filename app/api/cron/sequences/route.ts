import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getDriverForUser } from "@/lib/email/driver";

/**
 * Email sequence worker — cron endpoint for Railway.
 * Processes due sequence steps and scheduled emails (send-later, snooze, reminders).
 *
 * Railway schedule: every 5 minutes via GET /api/cron?job=sequence-worker
 */
export async function GET(request: Request) {
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const now = new Date().toISOString();
  let sequencesSent = 0;
  let scheduledProcessed = 0;
  const errors: string[] = [];

  // ── Process due sequence enrollments ───────────────────────
  try {
    const { data: dueEnrollments } = await admin
      .from("crm_email_sequence_enrollments")
      .select(`
        id, sequence_id, deal_id, contact_id, current_step, next_send_at,
        crm_email_sequences(steps, name),
        crm_contacts(name, email)
      `)
      .eq("status", "active")
      .lte("next_send_at", now)
      .limit(50);

    for (const enrollment of dueEnrollments ?? []) {
      try {
        const sequence = enrollment.crm_email_sequences as unknown as {
          steps: { delay_days: number; template_id: string; subject_override?: string }[];
          name: string;
        };
        const contact = enrollment.crm_contacts as unknown as { name: string; email: string };

        if (!sequence?.steps || !contact?.email) continue;

        const currentStep = sequence.steps[enrollment.current_step];
        if (!currentStep) {
          // All steps done
          await admin.from("crm_email_sequence_enrollments")
            .update({ status: "completed", completed_at: now })
            .eq("id", enrollment.id);
          continue;
        }

        // Fetch template
        const { data: template } = await admin
          .from("crm_email_templates")
          .select("name, subject, body, variables")
          .eq("id", currentStep.template_id)
          .single();

        if (!template) continue;

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

        // Find a connection to send from
        const { data: connections } = await admin
          .from("crm_email_connections")
          .select("id, user_id, email")
          .eq("is_default", true)
          .limit(1);

        if (!connections?.length) continue;

        const conn = connections[0];

        // Actually send via Gmail driver
        try {
          const { driver } = await getDriverForUser(conn.user_id);
          await driver.send({
            to: [{ name: contact.name, email: contact.email }],
            subject,
            body,
          });
          sequencesSent++;
        } catch (sendErr) {
          errors.push(`Send failed for enrollment ${enrollment.id}: ${sendErr instanceof Error ? sendErr.message : "unknown"}`);
          continue;
        }

        // Advance to next step
        const nextStepIndex = enrollment.current_step + 1;
        const nextStep = sequence.steps[nextStepIndex];

        if (nextStep) {
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);
          await admin.from("crm_email_sequence_enrollments")
            .update({ current_step: nextStepIndex, next_send_at: nextSendAt.toISOString() })
            .eq("id", enrollment.id);
        } else {
          await admin.from("crm_email_sequence_enrollments")
            .update({ current_step: nextStepIndex, status: "completed", completed_at: now })
            .eq("id", enrollment.id);
        }

        // Audit log
        void admin.from("crm_email_audit_log").insert({
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
      } catch (err) {
        errors.push(`Enrollment ${enrollment.id}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  } catch (err) {
    errors.push(`Sequence fetch: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // ── Process scheduled emails (send-later, snooze expiry) ──
  try {
    const { data: dueScheduled } = await admin
      .from("crm_email_scheduled")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(50);

    for (const scheduled of dueScheduled ?? []) {
      try {
        switch (scheduled.type) {
          case "send_later": {
            if (scheduled.draft_data && scheduled.connection_id) {
              try {
                const { driver } = await getDriverForUser(scheduled.user_id, scheduled.connection_id);
                const draft = scheduled.draft_data as { to: { name: string; email: string }[]; subject: string; body: string };
                await driver.send({
                  to: draft.to,
                  subject: draft.subject,
                  body: draft.body,
                });
              } catch (sendErr) {
                errors.push(`Scheduled send ${scheduled.id}: ${sendErr instanceof Error ? sendErr.message : "unknown"}`);
                continue;
              }
            }
            break;
          }
          case "snooze": {
            if (scheduled.thread_id) {
              try {
                const { driver } = await getDriverForUser(scheduled.user_id, scheduled.connection_id);
                await driver.modifyLabels(scheduled.thread_id, ["INBOX"], []);
              } catch {
                // Non-fatal
              }
            }
            break;
          }
          case "follow_up_reminder": {
            // TODO: push notification or in-app reminder
            break;
          }
        }

        await admin.from("crm_email_scheduled")
          .update({ status: "executed", executed_at: now })
          .eq("id", scheduled.id);
        scheduledProcessed++;
      } catch (err) {
        errors.push(`Scheduled ${scheduled.id}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  } catch (err) {
    errors.push(`Scheduled fetch: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return NextResponse.json({
    ok: true,
    ran_at: now,
    sequences_sent: sequencesSent,
    scheduled_processed: scheduledProcessed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
