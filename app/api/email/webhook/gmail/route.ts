import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getDriverForUser } from "@/lib/email/driver";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Google's public key set for Pub/Sub push JWTs
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

/** Verify the Google Pub/Sub push JWT bearer token */
async function verifyPubSubToken(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const audience = process.env.NEXT_PUBLIC_APP_URL;
  if (!audience) return false; // Reject if app URL not configured

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience,
    });
    // Verify the email claim matches Google's push service with verified email
    if (payload.email !== "noreply@google.com" || payload.email_verified !== true) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Verify the request is from Google Pub/Sub
  const isValid = await verifyPubSubToken(request);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let body: { message?: { data?: string; messageId?: string }; subscription?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.message?.data) {
    return NextResponse.json({ ok: true }); // Ack empty messages
  }

  // Decode Pub/Sub payload
  let payload: { emailAddress?: string; historyId?: string };
  try {
    const decoded = Buffer.from(body.message.data, "base64").toString("utf-8");
    payload = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!payload.emailAddress || !payload.historyId) {
    return NextResponse.json({ ok: true }); // Ack but skip
  }

  // Find ALL connections for this email (supports shared inboxes)
  const { data: connections } = await admin
    .from("crm_email_connections")
    .select("id, user_id, watch_history_id")
    .eq("email", payload.emailAddress);

  if (!connections?.length) {
    return NextResponse.json({ ok: true }); // No matching connection
  }

  // Process all connections in parallel to stay within Pub/Sub's 10s ack deadline.
  // Sequential processing with shared inboxes (N users × driver init × API call) would exceed it.
  await Promise.allSettled(connections.map(async (conn) => {
    const previousHistoryId = conn.watch_history_id;

    // Validate historyId is monotonically increasing to prevent replay attacks
    try {
      if (previousHistoryId && payload.historyId && BigInt(payload.historyId) <= BigInt(previousHistoryId)) {
        return; // Stale or replayed notification for this connection — skip
      }
    } catch {
      console.error("[gmail-webhook] Invalid historyId — cannot convert to BigInt:", payload.historyId);
      return;
    }

    // Get changes since last known history ID
    let threadIds: string[] = [];
    let newHistoryId = payload.historyId;
    try {
      if (previousHistoryId) {
        const { driver } = await getDriverForUser(conn.user_id, conn.id);
        if ("listHistory" in driver && typeof driver.listHistory === "function") {
          const result = await driver.listHistory(previousHistoryId);
          threadIds = result.changes.map((c: { threadId: string }) => c.threadId);
          // Use the historyId from listHistory — handles 404 recovery with fresh ID from getProfile()
          newHistoryId = result.historyId ?? payload.historyId;
        }
      }
    } catch {
      // Don't advance historyId on failure — leave it unchanged so the next
      // push notification can retry from the same position. Advancing on
      // failure (e.g., expired token) permanently loses those notifications.
      return;
    }

    // Update connection's history ID (scoped by user_id for safety)
    await admin
      .from("crm_email_connections")
      .update({ watch_history_id: newHistoryId })
      .eq("id", conn.id)
      .eq("user_id", conn.user_id);

    // Insert push event for Realtime subscription
    await admin.from("crm_email_push_events").insert({
      user_id: conn.user_id,
      email: payload.emailAddress,
      history_id: newHistoryId,
      thread_ids: threadIds,
    });
  }));

  return NextResponse.json({ ok: true });
}
