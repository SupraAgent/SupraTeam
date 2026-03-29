import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { sanitizeEmailError } from "@/lib/email/errors";

// Renew watch if it expires within this window (1 day buffer before 7-day expiry)
const RENEWAL_BUFFER_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const PUBSUB_TOPIC = process.env.GOOGLE_PUBSUB_TOPIC ?? "";
  if (!PUBSUB_TOPIC) {
    return NextResponse.json({ error: "GOOGLE_PUBSUB_TOPIC not configured" }, { status: 503 });
  }

  try {
    const { driver, connection } = await getDriverForUser(auth.user.id);

    // Skip re-registration if watch is still active (saves Gmail API quota)
    const { data: connData } = await auth.admin
      .from("crm_email_connections")
      .select("watch_expiration")
      .eq("id", connection.id)
      .eq("user_id", auth.user.id)
      .single();

    if (connData?.watch_expiration) {
      const expiresAt = new Date(connData.watch_expiration).getTime();
      if (expiresAt > Date.now() + RENEWAL_BUFFER_MS) {
        return NextResponse.json({ data: { skipped: true, expiration: connData.watch_expiration }, source: "gmail" });
      }
    }

    if (!("watchInbox" in driver) || typeof driver.watchInbox !== "function") {
      return NextResponse.json({ error: "Watch not supported" }, { status: 400 });
    }

    const result = await driver.watchInbox(PUBSUB_TOPIC);

    // Store watch state
    const expirationMs = parseInt(result.expiration);
    const expirationDate = isNaN(expirationMs) ? null : new Date(expirationMs).toISOString();

    await auth.admin
      .from("crm_email_connections")
      .update({
        watch_history_id: result.historyId,
        watch_expiration: expirationDate,
      })
      .eq("id", connection.id)
      .eq("user_id", auth.user.id);

    return NextResponse.json({ data: result, source: "gmail" });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Watch registration failed");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
