import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);

interface RateLimitOptions {
  /** Max requests per window */
  max: number;
  /** Window size in seconds */
  windowSec: number;
}

const DEFAULTS: RateLimitOptions = { max: 60, windowSec: 60 };

/**
 * In-memory fixed-window rate limiter for Railway's single-instance process.
 * NOTE: Not distributed — will not work across multiple instances.
 * Returns null if allowed, or a 429 NextResponse if rate-limited.
 */
export function rateLimit(
  key: string,
  opts: Partial<RateLimitOptions> = {}
): NextResponse | null {
  const { max, windowSec } = { ...DEFAULTS, ...opts };
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return null;
  }

  entry.count++;
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}
