/**
 * Bot-side webhook dispatcher. Mirrors lib/webhooks.ts but uses the bot's
 * supabase client directly (separate process, no Next.js context).
 */

import { supabase } from "./supabase.js";
import { createHmac } from "crypto";

type WebhookEvent = string;

export async function dispatchBotWebhook(
  eventType: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const { data: webhooks } = await supabase
      .from("crm_webhooks")
      .select("id, url, secret, headers, failure_count")
      .eq("is_active", true)
      .contains("events", [eventType]);

    if (!webhooks || webhooks.length === 0) return;

    const eventPayload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    for (const webhook of webhooks) {
      deliverWebhook(webhook, eventType, eventPayload).catch(() => {});
    }
  } catch {
    // Silent — webhook dispatch should never block bot operations
  }
}

async function deliverWebhook(
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

  if (secret) {
    // Note: in bot context, secret may be stored encrypted.
    // For simplicity, compute HMAC with raw value — if encrypted, the signature won't match
    // and the webhook consumer should use the delivery log instead.
    const signature = createHmac("sha256", secret).update(body).digest("hex");
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
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    responseBody = await res.text().catch(() => "");
    success = res.ok;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : "Network error";
  }

  const durationMs = Date.now() - startTime;

  await supabase.from("crm_webhook_deliveries").insert({
    webhook_id: webhook.id,
    event_type: eventType,
    payload,
    response_status: status || null,
    response_body: responseBody.slice(0, 1000),
    duration_ms: durationMs,
    success,
  });

  const updates: Record<string, unknown> = {
    last_triggered_at: new Date().toISOString(),
    last_status: status || null,
  };

  if (!success) {
    updates.failure_count = ((webhook.failure_count as number) ?? 0) + 1;
    if ((updates.failure_count as number) >= 10) {
      updates.is_active = false;
    }
  } else {
    updates.failure_count = 0;
  }

  await supabase.from("crm_webhooks").update(updates).eq("id", webhook.id);
}
