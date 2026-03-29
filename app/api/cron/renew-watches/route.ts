import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getDriverForUser } from "@/lib/email/driver";

const PUBSUB_TOPIC = process.env.GOOGLE_PUBSUB_TOPIC ?? "";

/**
 * Gmail Watch renewal cron — renews Pub/Sub watches before they expire.
 * Gmail watches expire after 7 days. This should run daily.
 *
 * Railway schedule: GET /api/cron?job=renew-watches
 */
export async function GET(request: Request) {
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  if (!PUBSUB_TOPIC) {
    return NextResponse.json({ error: "GOOGLE_PUBSUB_TOPIC not configured" }, { status: 503 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Find connections with watches expiring within 24 hours, already expired,
  // OR never set up (NULL watch_expiration). This catches connections where
  // the initial watch registration failed or the expiration was lost.
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: expiringConns } = await admin
    .from("crm_email_connections")
    .select("id, user_id, email, watch_expiration")
    .not("watch_expiration", "is", null)
    .lte("watch_expiration", cutoff);

  const { data: unwatchedConns } = await admin
    .from("crm_email_connections")
    .select("id, user_id, email, watch_expiration")
    .is("watch_expiration", null);

  const connections = [...(expiringConns ?? []), ...(unwatchedConns ?? [])];

  let renewed = 0;
  const errors: string[] = [];

  // Process in parallel batches of 5 to avoid Railway's 30s cron timeout
  const BATCH_SIZE = 5;
  for (let i = 0; i < connections.length; i += BATCH_SIZE) {
    const batch = connections.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (conn) => {
      const { driver } = await getDriverForUser(conn.user_id, conn.id);

      if (!("watchInbox" in driver) || typeof driver.watchInbox !== "function") return;

      const result = await driver.watchInbox(PUBSUB_TOPIC);
      const expirationMs = parseInt(result.expiration);
      const expirationDate = isNaN(expirationMs) ? null : new Date(expirationMs).toISOString();

      await admin
        .from("crm_email_connections")
        .update({
          watch_history_id: result.historyId,
          watch_expiration: expirationDate,
        })
        .eq("id", conn.id)
        .eq("user_id", conn.user_id);

      renewed++;
    }));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "rejected") {
        errors.push(`${batch[j].email}: ${r.reason instanceof Error ? r.reason.message : "unknown"}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    renewed,
    total_checked: connections?.length ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}
