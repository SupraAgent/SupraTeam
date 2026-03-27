import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron-auth";

/**
 * Unified cron dispatcher for Railway.
 *
 * Railway cron service calls: GET /api/cron?job=<name>
 *
 * Jobs:
 *   - poll-notifications  (every 5 min)  — send TG messages for stage changes
 *   - daily-digest        (weekdays 9am) — pipeline summary to TG groups
 *   - sequence-worker     (every 5 min)  — process email sequences + scheduled sends
 *   - deal-intelligence   (daily)        — health scores, sentiment, AI summaries
 *   - engagement-scoring  (hourly)       — recalculate contact engagement scores
 *
 * Without ?job param, runs all frequent jobs (poll-notifications + sequence-worker + deal-intelligence + engagement-scoring).
 */
export async function GET(request: Request) {
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SITE_URL not set" }, { status: 503 });
  }

  const results: Record<string, unknown> = {};

  // Helper to call internal API routes
  async function runJob(name: string, path: string) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: process.env.CRON_SECRET
          ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {},
      });
      results[name] = await res.json();
    } catch (err) {
      results[name] = { error: err instanceof Error ? err.message : "Failed" };
    }
  }

  if (job) {
    // Run specific job
    switch (job) {
      case "poll-notifications":
        await runJob("poll-notifications", "/api/bot/poll-notifications");
        break;
      case "daily-digest":
        await runJob("daily-digest", "/api/bot/daily-digest");
        break;
      case "sequence-worker":
        await runJob("sequence-worker", "/api/cron/sequences");
        break;
      case "deal-intelligence":
        await runJob("deal-intelligence", "/api/cron/deal-intelligence");
        break;
      case "engagement-scoring":
        await runJob("engagement-scoring", "/api/contacts/engagement");
        break;
      default:
        return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });
    }
  } else {
    // Default: run all frequent jobs in parallel
    await Promise.all([
      runJob("poll-notifications", "/api/bot/poll-notifications"),
      runJob("sequence-worker", "/api/cron/sequences"),
      runJob("deal-intelligence", "/api/cron/deal-intelligence"),
      runJob("engagement-scoring", "/api/contacts/engagement"),
    ]);
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    results,
  });
}
