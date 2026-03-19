import { NextResponse } from "next/server";

/**
 * Verify cron requests come from Vercel or include the correct auth token.
 * Vercel cron jobs include an Authorization header with CRON_SECRET.
 */
export function verifyCron(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return null; // No secret configured, allow (dev mode)

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return null; // Valid

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
