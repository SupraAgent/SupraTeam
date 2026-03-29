import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getDriverForUser } from "@/lib/email/driver";
import { sanitizeTemplateHtml } from "@/lib/email/sanitize";

/** Basic email format check for scheduled send validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Escape HTML special characters to prevent XSS in template variables */
function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
        id, sequence_id, deal_id, contact_id, current_step, next_send_at, enrolled_by,
        crm_email_sequences(steps, name, created_by),
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

        // Check if contact has replied — stop sequence to avoid spamming after a response.
        // Previous bug: crm_email_push_events.email stores the user's Gmail address, NOT
        // the contact's email, so we can't match on it directly. Instead, find threads
        // linked to this contact and check for push events on those threads since enrollment.
        const { data: contactThreads } = await admin
          .from("crm_email_thread_links")
          .select("thread_id")
          .eq("contact_id", enrollment.contact_id);

        const linkedThreadIds = (contactThreads ?? []).map((t) => t.thread_id);
        let replyCount = 0;

        if (linkedThreadIds.length > 0) {
          // Check for push events (new Gmail activity) on contact-linked threads
          // since enrollment started. Push events with overlapping thread_ids indicate
          // new messages on those threads — likely a reply from the contact.
          const enrolledAt = (enrollment as unknown as { enrolled_at?: string }).enrolled_at
            ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

          const { count } = await admin
            .from("crm_email_push_events")
            .select("id", { count: "exact", head: true })
            .overlaps("thread_ids", linkedThreadIds)
            .gte("created_at", enrolledAt);

          replyCount = count ?? 0;
        }

        if (replyCount && replyCount > 0) {
          await admin.from("crm_email_sequence_enrollments")
            .update({ status: "replied", completed_at: now })
            .eq("id", enrollment.id);
          continue;
        }

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
          name: escapeHtml(contact.name?.split(" ")[0] ?? ""),
          full_name: escapeHtml(contact.name ?? ""),
          email: escapeHtml(contact.email ?? ""),
        };
        for (const [key, value] of Object.entries(vars)) {
          // Use replaceAll instead of regex to avoid ReDoS with user-controlled template variables
          // and to handle regex special chars in replacement values (e.g., $& in contact names)
          body = body.replaceAll(`{${key}}`, value);
          subject = subject.replaceAll(`{${key}}`, value);
        }

        // Sanitize HTML after variable substitution to strip any injected script/style/etc.
        body = sanitizeTemplateHtml(body);

        // Use the enrolling user as the sender (not the sequence creator)
        const senderId = (enrollment as unknown as { enrolled_by?: string }).enrolled_by
          ?? (enrollment.crm_email_sequences as unknown as { created_by?: string })?.created_by;
        if (!senderId) {
          errors.push(`Enrollment ${enrollment.id}: no sender user found`);
          continue;
        }

        const { data: connections } = await admin
          .from("crm_email_connections")
          .select("id, user_id, email")
          .eq("user_id", senderId)
          .eq("is_default", true)
          .limit(1);

        if (!connections?.length) {
          errors.push(`Enrollment ${enrollment.id}: no email connection for user ${senderId}`);
          continue;
        }

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
                const draft = scheduled.draft_data as { to: { name: string; email: string }[]; subject: string; body: string };

                // Validate recipients before sending
                const validRecipients = (draft.to ?? []).filter(
                  (r) => r.email && isValidEmail(r.email)
                );
                if (validRecipients.length === 0) {
                  errors.push(`Scheduled send ${scheduled.id}: no valid recipients`);
                  continue;
                }

                // Sanitize body HTML before sending
                const sanitizedBody = sanitizeTemplateHtml(draft.body ?? "");

                const { driver } = await getDriverForUser(scheduled.user_id, scheduled.connection_id);
                await driver.send({
                  to: validRecipients,
                  subject: draft.subject,
                  body: sanitizedBody,
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
