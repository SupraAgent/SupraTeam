/**
 * Telegram-specific rate limiter for the workflow engine.
 *
 * Sliding window implementation that enforces:
 * - Per-chat: max 20 messages per 60 seconds (Telegram group limit)
 * - Per-bot global: max 30 messages per second (Telegram global limit)
 *
 * In-memory only — suitable for single-process deployment.
 * The lower-level send layer (telegram-send.ts) has its own token-bucket
 * limiter as a safety net; this layer lets the workflow engine get early
 * "rate_limit" errors that the retry system can handle gracefully.
 */

interface SlidingWindow {
  timestamps: number[];
}

const PER_CHAT_MAX = 20;
const PER_CHAT_WINDOW_MS = 60_000; // 60 seconds

const GLOBAL_MAX = 30;
const GLOBAL_WINDOW_MS = 1_000; // 1 second

/** chatKey → sliding window */
const chatWindows = new Map<string, SlidingWindow>();

/** botKey → sliding window */
const globalWindows = new Map<string, SlidingWindow>();

/** Prune timestamps older than the window from a sliding window */
function prune(window: SlidingWindow, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  // Find first index that's within the window
  let i = 0;
  while (i < window.timestamps.length && window.timestamps[i] < cutoff) {
    i++;
  }
  if (i > 0) {
    window.timestamps.splice(0, i);
  }
}

function getOrCreate(map: Map<string, SlidingWindow>, key: string): SlidingWindow {
  let w = map.get(key);
  if (!w) {
    w = { timestamps: [] };
    map.set(key, w);
  }
  return w;
}

export interface TgRateLimitResult {
  allowed: boolean;
  /** If not allowed, how many ms to wait before retrying */
  retryAfterMs: number;
}

/**
 * Check whether a message can be sent right now without exceeding limits.
 * Does NOT record the message — call `recordTgMessage` after a successful send.
 */
export function checkTgRateLimit(botId: string, chatId: string): TgRateLimitResult {
  const now = Date.now();

  // Check per-chat limit (20/min)
  const chatKey = `${botId}:${chatId}`;
  const chatWindow = getOrCreate(chatWindows, chatKey);
  prune(chatWindow, PER_CHAT_WINDOW_MS, now);

  if (chatWindow.timestamps.length >= PER_CHAT_MAX) {
    const oldest = chatWindow.timestamps[0];
    const retryAfterMs = oldest + PER_CHAT_WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 50) };
  }

  // Check global per-bot limit (30/sec)
  const globalWindow = getOrCreate(globalWindows, botId);
  prune(globalWindow, GLOBAL_WINDOW_MS, now);

  if (globalWindow.timestamps.length >= GLOBAL_MAX) {
    const oldest = globalWindow.timestamps[0];
    const retryAfterMs = oldest + GLOBAL_WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 50) };
  }

  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Record that a message was sent. Call after successful send.
 */
export function recordTgMessage(botId: string, chatId: string): void {
  const now = Date.now();

  const chatKey = `${botId}:${chatId}`;
  const chatWindow = getOrCreate(chatWindows, chatKey);
  chatWindow.timestamps.push(now);

  const globalWindow = getOrCreate(globalWindows, botId);
  globalWindow.timestamps.push(now);
}

// Periodic cleanup of stale windows to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of chatWindows) {
    prune(w, PER_CHAT_WINDOW_MS, now);
    if (w.timestamps.length === 0) chatWindows.delete(key);
  }
  for (const [key, w] of globalWindows) {
    prune(w, GLOBAL_WINDOW_MS, now);
    if (w.timestamps.length === 0) globalWindows.delete(key);
  }
}, 120_000);
