/**
 * Webhook dispatcher: fires events to registered webhook endpoints.
 * Called from API routes when CRM events occur.
 */

import { createSupabaseAdmin } from "@/lib/supabase";
import { decryptToken } from "@/lib/crypto";
import { createHmac } from "crypto";

export type WebhookEvent =
  | "deal.created"
  | "deal.updated"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "contact.created"
  | "contact.updated"
  | "note.created"
  | "group.message"
  | "group.member_joined"
  | "group.member_left"
  | "broadcast.sent"
  | "sequence.completed"
  | "qr.scanned"
  | "qr.converted"
  | "sequence.enrolled";

/**
 * Dispatch a webhook event to all active endpoints subscribed to this event type.
 * Non-blocking — fires and forgets, logs results.
 */
export async function dispatchWebhook(
  eventType: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;

  const { data: webhooks } = await supabase
    .from("crm_webhooks")
    .select("*")
    .eq("is_active", true)
    .contains("events", [eventType]);

  if (!webhooks || webhooks.length === 0) return;

  const eventPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  for (const webhook of webhooks) {
    // Fire each webhook without blocking
    deliverWebhook(supabase, webhook, eventType, eventPayload).catch(() => {});
  }
}

async function deliverWebhook(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  webhook: Record<string, unknown>,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const url = webhook.url as string;
  const secret = webhook.secret as string | null;
  const customHeaders = (webhook.headers ?? {}) as Record<string, string>;

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": eventType,
    ...customHeaders,
  };

  // Add HMAC signature if secret is configured (secret is stored encrypted)
  if (secret) {
    const plaintextSecret = decryptToken(secret);
    const signature = createHmac("sha256", plaintextSecret).update(body).digest("hex");
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
  }

  const startTime = Date.now();
  let status = 0;
  let responseBody = "";
  let success = false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "error", // Prevent SSRF via redirect to internal IPs
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    status = res.status;
    responseBody = await res.text().catch(() => "");
    success = res.ok;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : "Network error";
  }

  const durationMs = Date.now() - startTime;

  // Log delivery
  await supabase.from("crm_webhook_deliveries").insert({
    webhook_id: webhook.id,
    event_type: eventType,
    payload,
    response_status: status || null,
    response_body: responseBody.slice(0, 1000),
    duration_ms: durationMs,
    success,
  });

  // Update webhook status
  const updates: Record<string, unknown> = {
    last_triggered_at: new Date().toISOString(),
    last_status: status || null,
  };

  if (!success) {
    updates.failure_count = ((webhook.failure_count as number) ?? 0) + 1;
    // Auto-disable after 10 consecutive failures
    if ((updates.failure_count as number) >= 10) {
      updates.is_active = false;
    }
  } else {
    updates.failure_count = 0;
  }

  await supabase
    .from("crm_webhooks")
    .update(updates)
    .eq("id", webhook.id);
}
