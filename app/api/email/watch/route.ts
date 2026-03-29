import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { sanitizeEmailError } from "@/lib/email/errors";

const PUBSUB_TOPIC = process.env.GOOGLE_PUBSUB_TOPIC ?? "";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!PUBSUB_TOPIC) {
    return NextResponse.json({ error: "GOOGLE_PUBSUB_TOPIC not configured" }, { status: 503 });
  }

  try {
    const { driver, connection } = await getDriverForUser(auth.user.id);

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
