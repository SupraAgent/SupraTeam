import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verify cron requests come from a trusted source.
 * Supports:
 *  - Railway cron services (no auth needed — internal network only)
 *  - Vercel cron (Authorization: Bearer <CRON_SECRET>)
 *  - External schedulers (Authorization: Bearer <CRON_SECRET>)
 *
 * Set CRON_SECRET env var to enable auth. Without it, all requests are allowed (dev mode).
 * Set RAILWAY_ENVIRONMENT to skip auth for Railway internal cron calls.
 */
export function verifyCron(request: Request): NextResponse | null {
  // Railway cron services call via internal network — verify Railway internal header
  if (process.env.RAILWAY_ENVIRONMENT) {
    // Only trust if the request comes through Railway's internal network proxy
    const railwaySource = request.headers.get("x-railway-source");
    if (railwaySource === "cron") return null;
    // Fallback: still require CRON_SECRET if header missing
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Only skip auth in development; deny by default in production
    if (process.env.NODE_ENV === "development") return null;
    return NextResponse.json({ error: "Unauthorized: CRON_SECRET not configured" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${cronSecret}`;
  if (authHeader && authHeader.length === expected.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
    return null; // Valid
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
