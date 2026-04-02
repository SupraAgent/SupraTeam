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

// ── Supabase-backed rate limiter (source of truth) ─────────
// Calls the consume_rate_limit_token() RPC for atomic cross-instance limiting.
// Falls back to in-memory only if DB is unavailable.

async function consumeDbToken(bucketId: string, maxTokens: number, refillRate: number): Promise<boolean | null> {
  try {
    const supabase = createSupabaseAdmin();
    if (!supabase) return null; // no DB available, fall back to memory

    const { data, error } = await supabase.rpc("consume_rate_limit_token", {
      bucket_id: bucketId,
      p_max_tokens: maxTokens,
      p_refill_rate: refillRate,
    });

    if (error) {
      console.error("[rate-limit] DB RPC error, falling back to in-memory:", error.message);
      return null;
    }

    return data as boolean;
  } catch (err) {
    console.error("[rate-limit] DB call failed, falling back to in-memory:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Serialize rate limit acquisition to prevent concurrent callers going negative
let rateLimitQueue: Promise<void> = Promise.resolve();

async function acquireRateLimit(chatId: number): Promise<void> {
  const acquire = async () => {
    // ── Fast path: in-memory check first (avoids DB round-trip when clearly OK) ──
    refillGlobal();
    refillChat(chatId);
    const bucket = chatBuckets.get(chatId)!;

    const memoryGlobalOk = globalTokens >= 1;
    const memoryChatOk = bucket.tokens >= 1;

    // ── Source of truth: DB-backed limiter ──
    // Per-chat refill rate: 20 tokens per 60 seconds = 1/3 tokens/sec
    const dbGlobal = await consumeDbToken("global", RATE_LIMIT.maxTokens, RATE_LIMIT.tokensPerSec);
    const dbChat = await consumeDbToken(`chat:${chatId}`, RATE_LIMIT.perChatPerMin, RATE_LIMIT.perChatPerMin / 60);

    // Determine effective allow/deny. DB is authoritative when available.
    const globalAllowed = dbGlobal ?? memoryGlobalOk;
    const chatAllowed = dbChat ?? memoryChatOk;

    if (!globalAllowed) {
      // Wait for global bucket refill
      const waitMs = Math.ceil((1 / RATE_LIMIT.tokensPerSec) * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
      // Re-attempt DB consume after wait
      const retry = await consumeDbToken("global", RATE_LIMIT.maxTokens, RATE_LIMIT.tokensPerSec);
      if (retry === false) {
        // Still denied — proceed anyway (best-effort, Telegram will 429 us)
      }
    }

    if (!chatAllowed) {
      const waitMs = Math.min(Math.ceil((1 / (RATE_LIMIT.perChatPerMin / 60)) * 1000), 3000);
      await new Promise((r) => setTimeout(r, waitMs));
      const retry = await consumeDbToken(`chat:${chatId}`, RATE_LIMIT.perChatPerMin, RATE_LIMIT.perChatPerMin / 60);
      if (retry === false) {
        // Still denied — proceed best-effort
      }
    }

    // ── Keep in-memory state in sync (for fast-path accuracy) ──
    if (globalAllowed || dbGlobal === null) globalTokens = Math.max(0, globalTokens - 1);
    if (chatAllowed || dbChat === null) bucket.tokens = Math.max(0, bucket.tokens - 1);

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

// ── Per-DM rate limit (Telegram: 1 msg/sec to same user) ──
const dmLastSent = new Map<number, number>();

async function acquireDmRateLimit(chatId: number): Promise<void> {
  const last = dmLastSent.get(chatId) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }
  dmLastSent.set(chatId, Date.now());
  // Evict old entries
  if (dmLastSent.size > 1000) {
    const cutoff = Date.now() - 60000;
    for (const [id, t] of dmLastSent) {
      if (t < cutoff) dmLastSent.delete(id);
    }
  }
}

// ── Message length splitting ──────────────────────────────
const TG_MAX_MESSAGE_LENGTH = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= TG_MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= TG_MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }
    // Try to split at last newline before limit
    let splitAt = remaining.lastIndexOf("\n", TG_MAX_MESSAGE_LENGTH);
    if (splitAt < TG_MAX_MESSAGE_LENGTH * 0.5) splitAt = TG_MAX_MESSAGE_LENGTH;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return chunks;
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
  sendTypingIndicator?: boolean;
  messageThreadId?: number;
  disableNotification?: boolean;
  /** Set true for private/DM chats to enforce 1 msg/sec per-user limit */
  isDirectMessage?: boolean;
}): Promise<SendResult> {
  // Enforce per-DM rate limit (Telegram limits: 1 msg/sec to same user in DMs)
  if (params.isDirectMessage) {
    await acquireDmRateLimit(params.chatId);
  }

  // Send typing indicator for long operations
  if (params.sendTypingIndicator && BOT_TOKEN) {
    const actionBody: Record<string, unknown> = { chat_id: params.chatId, action: "typing" };
    if (params.messageThreadId) actionBody.message_thread_id = params.messageThreadId;
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actionBody),
    }).catch(() => {});
  }

  // Split long messages
  const chunks = splitMessage(params.text);
  let lastResult: SendResult = { success: false };

  for (let i = 0; i < chunks.length; i++) {
    const body: Record<string, unknown> = {
      chat_id: params.chatId,
      text: chunks[i],
      parse_mode: params.parseMode ?? "HTML",
    };
    // Only attach reply_markup to the last chunk
    if (params.replyMarkup && i === chunks.length - 1) body.reply_markup = params.replyMarkup;
    if (params.messageThreadId) body.message_thread_id = params.messageThreadId;
    if (params.disableNotification) body.disable_notification = true;

    const preview = chunks[i].length > 200 ? chunks[i].slice(0, 200) + "..." : chunks[i];

    lastResult = await executeWithTracking("sendMessage", body, {
      chatId: params.chatId,
      preview,
      fullText: chunks[i],
      notificationType: params.notificationType,
      dealId: params.dealId,
      automationRuleId: params.automationRuleId,
      scheduledMessageId: i === 0 ? params.scheduledMessageId : undefined,
    });

    if (!lastResult.success) break;
  }

  return lastResult;
}

/**
 * Shared: execute a Telegram API call with rate limiting, logging, and error handling.
 */
async function executeWithTracking(
  method: string,
  body: Record<string, unknown>,
  meta: { chatId: number; preview: string; fullText?: string; notificationType: string; dealId?: string; automationRuleId?: string; scheduledMessageId?: string }
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
          message_full_text: meta.fullText ?? null,
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
    const errorCode = data.error_code;

    // Handle 429 Flood Wait — retry after the specified delay
    if (errorCode === 429 && data.parameters?.retry_after) {
      const retryAfterSec = data.parameters.retry_after;
      if (retryAfterSec <= 30) {
        await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
        // One retry
        const retryRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const retryData = await retryRes.json();
        if (retryData.ok) {
          if (supabase) {
            await supabase.from("crm_notification_log").insert({
              notification_type: meta.notificationType,
              deal_id: meta.dealId ?? null,
              tg_chat_id: meta.chatId,
              message_preview: meta.preview,
          message_full_text: meta.fullText ?? null,
              status: "sent",
              tg_message_id: retryData.result?.message_id ?? null,
              automation_rule_id: meta.automationRuleId ?? null,
              scheduled_message_id: meta.scheduledMessageId ?? null,
              sent_at: new Date().toISOString(),
            });
          }
          return { success: true, messageId: retryData.result?.message_id };
        }
      }
    }

    // Detect permanently undeliverable errors — mark as dead_letter immediately
    const isPermFailure =
      errMsg.includes("user is deactivated") ||
      errMsg.includes("bot was blocked by the user") ||
      errMsg.includes("chat not found") ||
      errMsg.includes("PEER_ID_INVALID");

    if (supabase) {
      await supabase.from("crm_notification_log").insert({
        notification_type: meta.notificationType,
        deal_id: meta.dealId ?? null,
        tg_chat_id: meta.chatId,
        message_preview: meta.preview,
        status: isPermFailure ? "dead_letter" : "failed",
        last_error: errMsg,
        retry_count: isPermFailure ? 3 : 0,
        next_retry_at: isPermFailure ? null : new Date(Date.now() + 60_000).toISOString(),
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
 * Send a message and pin it in the chat. Used for deal status summaries.
 * Unpins any previous bot-pinned status message first (best-effort).
 */
export async function sendAndPinMessage(params: {
  chatId: number;
  text: string;
  notificationType: string;
  dealId?: string;
  disableNotification?: boolean;
}): Promise<SendResult> {
  if (!BOT_TOKEN) return { success: false, error: "No bot token configured" };

  await acquireRateLimit(params.chatId);
  const body = {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: "HTML",
    disable_notification: params.disableNotification ?? true,
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) return { success: false, error: data.description ?? "Send failed" };

    const messageId = data.result?.message_id;
    if (messageId) {
      // Pin the message (silently)
      fetch(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: params.chatId,
          message_id: messageId,
          disable_notification: true,
        }),
      }).catch(() => {});
    }

    // Log delivery
    const supabase = createSupabaseAdmin();
    if (supabase) {
      const { error: logErr } = await supabase.from("crm_notification_log").insert({
        notification_type: params.notificationType,
        deal_id: params.dealId ?? null,
        tg_chat_id: params.chatId,
        message_preview: params.text.slice(0, 200),
        status: "sent",
        tg_message_id: messageId ?? null,
        sent_at: new Date().toISOString(),
      });
      if (logErr) console.error("[telegram-send] delivery log error:", logErr.message);
    }

    return { success: true, messageId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
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
