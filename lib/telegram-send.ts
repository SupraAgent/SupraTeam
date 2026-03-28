/**
 * Reliable Telegram send layer with delivery tracking.
 * All notification paths should use this instead of raw fetch.
 */
import { createSupabaseAdmin } from "@/lib/supabase";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ── Token-bucket rate limiter ──────────────────────────────
// Telegram allows ~30 msg/s globally, ~20 msg/min per group.
// We use a conservative 25 msg/s global bucket.

const RATE_LIMIT = {
  tokensPerSec: 25,
  maxTokens: 30,
  perChatPerMin: 20,
};

let globalTokens = RATE_LIMIT.maxTokens;
let lastRefill = Date.now();
const chatBuckets = new Map<number, { tokens: number; lastRefill: number }>();

function refillGlobal() {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  globalTokens = Math.min(RATE_LIMIT.maxTokens, globalTokens + elapsed * RATE_LIMIT.tokensPerSec);
  lastRefill = now;
}

function refillChat(chatId: number) {
  const bucket = chatBuckets.get(chatId);
  if (!bucket) {
    chatBuckets.set(chatId, { tokens: RATE_LIMIT.perChatPerMin, lastRefill: Date.now() });
    return;
  }
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 60000; // minutes
  bucket.tokens = Math.min(RATE_LIMIT.perChatPerMin, bucket.tokens + elapsed * RATE_LIMIT.perChatPerMin);
  bucket.lastRefill = now;
}

// Serialize rate limit acquisition to prevent concurrent callers going negative
let rateLimitQueue: Promise<void> = Promise.resolve();

async function acquireRateLimit(chatId: number): Promise<void> {
  const acquire = async () => {
    // Global bucket
    refillGlobal();
    if (globalTokens < 1) {
      const waitMs = Math.ceil((1 - globalTokens) / RATE_LIMIT.tokensPerSec * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
      refillGlobal();
    }
    globalTokens -= 1;

    // Per-chat bucket
    refillChat(chatId);
    const bucket = chatBuckets.get(chatId)!;
    if (bucket.tokens < 1) {
      const waitMs = Math.ceil((1 - bucket.tokens) / RATE_LIMIT.perChatPerMin * 60000);
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 3000))); // cap wait at 3s
      refillChat(chatId);
    }
    bucket.tokens -= 1;

    // Evict old chat buckets to prevent memory leak
    if (chatBuckets.size > 500) {
      const cutoff = Date.now() - 120000;
      for (const [id, b] of chatBuckets) {
        if (b.lastRefill < cutoff) chatBuckets.delete(id);
      }
    }
  };

  rateLimitQueue = rateLimitQueue.then(acquire, acquire);
  return rateLimitQueue;
}

export interface SendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export async function sendTelegramWithTracking(params: {
  chatId: number;
  text: string;
  notificationType: string;
  dealId?: string;
  automationRuleId?: string;
  scheduledMessageId?: string;
  parseMode?: string;
  replyMarkup?: object;
}): Promise<SendResult> {
  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: params.parseMode ?? "HTML",
  };
  if (params.replyMarkup) body.reply_markup = params.replyMarkup;

  const preview = params.text.length > 200 ? params.text.slice(0, 200) + "..." : params.text;

  return executeWithTracking("sendMessage", body, {
    chatId: params.chatId,
    preview,
    notificationType: params.notificationType,
    dealId: params.dealId,
    automationRuleId: params.automationRuleId,
    scheduledMessageId: params.scheduledMessageId,
  });
}

/**
 * Shared: execute a Telegram API call with rate limiting, logging, and error handling.
 */
async function executeWithTracking(
  method: string,
  body: Record<string, unknown>,
  meta: { chatId: number; preview: string; notificationType: string; dealId?: string; automationRuleId?: string; scheduledMessageId?: string }
): Promise<SendResult> {
  if (!BOT_TOKEN) return { success: false, error: "No bot token configured" };
  const supabase = createSupabaseAdmin();

  try {
    await acquireRateLimit(meta.chatId);
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.ok) {
      if (supabase) {
        await supabase.from("crm_notification_log").insert({
          notification_type: meta.notificationType,
          deal_id: meta.dealId ?? null,
          tg_chat_id: meta.chatId,
          message_preview: meta.preview,
          status: "sent",
          tg_message_id: data.result?.message_id ?? null,
          automation_rule_id: meta.automationRuleId ?? null,
          scheduled_message_id: meta.scheduledMessageId ?? null,
          sent_at: new Date().toISOString(),
        });
      }
      return { success: true, messageId: data.result?.message_id };
    }

    const errMsg = data.description ?? "Unknown Telegram error";
    if (supabase) {
      await supabase.from("crm_notification_log").insert({
        notification_type: meta.notificationType,
        deal_id: meta.dealId ?? null,
        tg_chat_id: meta.chatId,
        message_preview: meta.preview,
        status: "failed",
        last_error: errMsg,
        retry_count: 0,
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        automation_rule_id: meta.automationRuleId ?? null,
        scheduled_message_id: meta.scheduledMessageId ?? null,
      });
    }
    return { success: false, error: errMsg };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
    if (supabase) {
      await supabase.from("crm_notification_log").insert({
        notification_type: meta.notificationType,
        deal_id: meta.dealId ?? null,
        tg_chat_id: meta.chatId,
        message_preview: meta.preview,
        status: "failed",
        last_error: errMsg,
        retry_count: 0,
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        automation_rule_id: meta.automationRuleId ?? null,
        scheduled_message_id: meta.scheduledMessageId ?? null,
      });
    }
    return { success: false, error: errMsg };
  }
}

/**
 * Send a photo or document via Telegram Bot API with tracking.
 */
export async function sendTelegramMediaWithTracking(params: {
  chatId: number;
  mediaType: "photo" | "document";
  fileId: string;
  caption?: string;
  notificationType: string;
  dealId?: string;
  parseMode?: string;
  replyMarkup?: object;
}): Promise<SendResult> {
  const method = params.mediaType === "photo" ? "sendPhoto" : "sendDocument";
  const fileKey = params.mediaType === "photo" ? "photo" : "document";
  const body: Record<string, unknown> = { chat_id: params.chatId, [fileKey]: params.fileId };
  if (params.caption) {
    body.caption = params.caption;
    body.parse_mode = params.parseMode ?? "HTML";
  }
  if (params.replyMarkup) body.reply_markup = params.replyMarkup;

  const preview = params.caption
    ? params.caption.length > 200 ? params.caption.slice(0, 200) + "..." : params.caption
    : `[${params.mediaType}]`;

  return executeWithTracking(method, body, {
    chatId: params.chatId,
    preview,
    notificationType: params.notificationType,
    dealId: params.dealId,
  });
}

/**
 * Process failed notifications that need retry.
 * Called from cron jobs.
 */
export async function processRetries(): Promise<number> {
  if (!BOT_TOKEN) return 0;
  const supabase = createSupabaseAdmin();
  if (!supabase) return 0;

  const { data: failed } = await supabase
    .from("crm_notification_log")
    .select("*")
    .in("status", ["failed"])
    .lt("retry_count", 3)
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at")
    .limit(10);

  if (!failed || failed.length === 0) return 0;

  let retried = 0;
  for (const entry of failed) {
    try {
      // Rate-limit retries too
      await acquireRateLimit(entry.tg_chat_id);

      const retryText = entry.message_full_text || entry.message_preview;
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: entry.tg_chat_id,
          text: retryText,
          parse_mode: "HTML",
        }),
      });
      const data = await res.json();

      if (data.ok) {
        await supabase
          .from("crm_notification_log")
          .update({
            status: "sent",
            tg_message_id: data.result?.message_id,
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", entry.id);
        retried++;
      } else {
        const newRetry = entry.retry_count + 1;
        const backoffMs = [60_000, 300_000, 900_000][Math.min(newRetry, 2)]; // 1min, 5min, 15min
        await supabase
          .from("crm_notification_log")
          .update({
            retry_count: newRetry,
            last_error: data.description ?? "Retry failed",
            status: newRetry >= 3 ? "dead_letter" : "failed",
            next_retry_at: newRetry < 3 ? new Date(Date.now() + backoffMs).toISOString() : null,
          })
          .eq("id", entry.id);
      }
    } catch (err) {
      const newRetry = entry.retry_count + 1;
      await supabase
        .from("crm_notification_log")
        .update({
          retry_count: newRetry,
          last_error: err instanceof Error ? err.message : "Network error",
          status: newRetry >= 3 ? "dead_letter" : "failed",
          next_retry_at: newRetry < 3 ? new Date(Date.now() + 300_000).toISOString() : null,
        })
        .eq("id", entry.id);
    }
  }
  return retried;
}

/**
 * Process scheduled messages that are due.
 * Called from cron jobs.
 */
export async function processScheduledMessages(): Promise<number> {
  if (!BOT_TOKEN) return 0;
  const supabase = createSupabaseAdmin();
  if (!supabase) return 0;

  const { data: messages } = await supabase
    .from("crm_scheduled_messages")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .order("send_at")
    .limit(10);

  if (!messages || messages.length === 0) return 0;

  let sent = 0;
  for (const msg of messages) {
    const result = await sendTelegramWithTracking({
      chatId: msg.tg_chat_id,
      text: msg.message_text,
      notificationType: "scheduled",
      dealId: msg.deal_id ?? undefined,
      automationRuleId: msg.automation_rule_id ?? undefined,
      scheduledMessageId: msg.id,
    });

    if (result.success) {
      await supabase
        .from("crm_scheduled_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);
      sent++;
    } else {
      const newRetry = (msg.retry_count ?? 0) + 1;
      await supabase
        .from("crm_scheduled_messages")
        .update({
          retry_count: newRetry,
          last_error: result.error,
          status: newRetry >= 3 ? "failed" : "pending",
        })
        .eq("id", msg.id);
    }
  }
  return sent;
}
