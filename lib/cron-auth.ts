import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verify cron requests come from a trusted source.
 * All environments require CRON_SECRET as a Bearer token.
 *
 * Set CRON_SECRET env var to enable auth. Without it:
 *   - Development: requests are allowed (no auth)
 *   - Production: requests are denied by default
 */
export function verifyCron(request: Request): NextResponse | null {
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
