import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getDriverForUser } from "@/lib/email/driver";

export async function POST(request: Request) {
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

  // Find the connection by email
  const { data: connections } = await admin
    .from("crm_email_connections")
    .select("id, user_id, watch_history_id")
    .eq("email", payload.emailAddress)
    .limit(1);

  if (!connections?.length) {
    return NextResponse.json({ ok: true }); // No matching connection
  }

  const conn = connections[0];
  const previousHistoryId = conn.watch_history_id;

  // Get changes since last known history ID
  let threadIds: string[] = [];
  try {
    if (previousHistoryId) {
      const { driver } = await getDriverForUser(conn.user_id, conn.id);
      if ("listHistory" in driver && typeof driver.listHistory === "function") {
        const result = await driver.listHistory(previousHistoryId);
        threadIds = result.changes.map((c: { threadId: string }) => c.threadId);
      }
    }
  } catch {
    // Non-fatal — still update history ID
  }

  // Update connection's history ID
  await admin
    .from("crm_email_connections")
    .update({ watch_history_id: payload.historyId })
    .eq("id", conn.id);

  // Insert push event for Realtime subscription
  await admin.from("crm_email_push_events").insert({
    user_id: conn.user_id,
    email: payload.emailAddress,
    history_id: payload.historyId,
    thread_ids: threadIds,
  });

  return NextResponse.json({ ok: true });
}
