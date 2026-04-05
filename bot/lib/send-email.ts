/**
 * Email sending helper for the outreach worker.
 * Uses the CRM's email compose API internally via Supabase to look up
 * the user's Gmail connection and send via Google APIs.
 */

import { supabase } from "./supabase.js";

interface OutreachEmailParams {
  to: string;
  subject: string;
  body: string;
  enrollmentId: string;
}

/**
 * Send an outreach email by looking up the enrollment owner's Gmail connection
 * and sending via the GmailDriver.
 *
 * Falls back gracefully if no email connection is configured.
 */
export async function sendOutreachEmail(params: OutreachEmailParams): Promise<void> {
  const { to, subject, body, enrollmentId } = params;

  // Look up which user owns this enrollment (via the sequence)
  const { data: enrollment } = await supabase
    .from("crm_outreach_enrollments")
    .select("sequence_id")
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) {
    throw new Error(`Enrollment ${enrollmentId} not found`);
  }

  const { data: sequence } = await supabase
    .from("crm_outreach_sequences")
    .select("created_by")
    .eq("id", enrollment.sequence_id)
    .single();

  if (!sequence?.created_by) {
    throw new Error("Could not determine sequence owner for email sending");
  }

  // Find the user's Gmail connection
  const { data: connection } = await supabase
    .from("user_tokens")
    .select("id")
    .eq("user_id", sequence.created_by)
    .eq("provider", "gmail")
    .limit(1)
    .maybeSingle();

  if (!connection) {
    throw new Error("No Gmail connection found for sequence owner. Email step skipped.");
  }

  // Store the email in outbox for the email worker to pick up
  await supabase.from("crm_email_outbox").insert({
    user_id: sequence.created_by,
    connection_id: connection.id,
    to_email: to,
    subject,
    body_text: body,
    source: "outreach_sequence",
    source_id: enrollmentId,
    status: "pending",
  });

  console.warn(`[outreach-worker] Queued email to ${to} for enrollment ${enrollmentId}`);
}
