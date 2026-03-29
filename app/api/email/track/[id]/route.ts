import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

// 1x1 transparent GIF pixel
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Simple in-memory rate limiter: max 5 opens per tracking ID per IP per 10 min
const openTracker = new Map<string, { count: number; ts: number }>();
const RATE_WINDOW = 600_000; // 10 min
const RATE_MAX = 5;

function isRateLimited(trackingId: string, ipHash: string): boolean {
  const key = `${trackingId}:${ipHash}`;
  const now = Date.now();
  const entry = openTracker.get(key);
  if (!entry || now - entry.ts > RATE_WINDOW) {
    openTracker.set(key, { count: 1, ts: now });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_MAX) return true;
  return false;
}

// Periodic cleanup of stale entries (every 500 lookups or when map exceeds max size)
const MAX_TRACKER_SIZE = 10_000;
let lookupCount = 0;
function maybeCleanup() {
  lookupCount++;
  if (lookupCount < 500 && openTracker.size < MAX_TRACKER_SIZE) return;
  lookupCount = 0;
  const now = Date.now();
  for (const [key, entry] of openTracker) {
    if (now - entry.ts > RATE_WINDOW) openTracker.delete(key);
  }
  // If still over limit after expiry cleanup, evict oldest entries
  if (openTracker.size >= MAX_TRACKER_SIZE) {
    const entries = [...openTracker.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const toRemove = entries.slice(0, entries.length - Math.floor(MAX_TRACKER_SIZE * 0.75));
    for (const [key] of toRemove) openTracker.delete(key);
  }
}

type Params = { params: Promise<{ id: string }> };

/** GET: Tracking pixel — records email open event */
export async function GET(request: Request, { params }: Params) {
  const { id: trackingId } = await params;

  // Record the open — look up tracking record to get user_id
  try {
    const admin = createSupabaseAdmin();
    if (!admin) throw new Error("No admin client");

    const ipHash = hashIp(request.headers.get("x-forwarded-for") ?? "unknown");
    maybeCleanup();

    // Rate limit per tracking ID + IP to prevent abuse
    if (isRateLimited(trackingId, ipHash)) {
      return new NextResponse(PIXEL, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        },
      });
    }

    // Validate tracking_id exists and get the owner
    const { data: tracking } = await admin
      .from("crm_email_tracking")
      .select("user_id")
      .eq("id", trackingId)
      .single();

    if (!tracking) {
      // Invalid tracking ID — return pixel but don't record
      return new NextResponse(PIXEL, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        },
      });
    }

    await admin.from("crm_email_tracking_events").insert({
      tracking_id: trackingId,
      user_id: tracking.user_id,
      event_type: "open",
      user_agent: request.headers.get("user-agent") ?? null,
      ip_hash: ipHash,
      opened_at: new Date().toISOString(),
    });
  } catch {
    // Don't fail — tracking is best-effort
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/** SHA-256 hash with salt for privacy — non-reversible, no raw IP stored */
function hashIp(ip: string): string {
  const salt = process.env.TOKEN_ENCRYPTION_KEY;
  if (!salt) throw new Error("TOKEN_ENCRYPTION_KEY required for IP hashing");
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}
