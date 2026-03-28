import { NextResponse } from "next/server";

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
  // Railway cron services call via internal network — trust them
  if (process.env.RAILWAY_ENVIRONMENT) return null;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Only skip auth in development; deny by default in production
    if (process.env.NODE_ENV === "development") return null;
    return NextResponse.json({ error: "Unauthorized: CRON_SECRET not configured" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return null; // Valid

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
