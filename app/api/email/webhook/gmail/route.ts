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

// Cap auto-routing to avoid blowing past Pub/Sub's 10s ack deadline
const MAX_AUTO_ROUTE_THREADS = 20;

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
    .eq("email", payload.emailAddress)
    .eq("provider", "gmail");

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

    // Get changes since last known history ID — reuse driver for auto-routing below
    let threadIds: string[] = [];
    let newHistoryId = payload.historyId;
    let driver: Awaited<ReturnType<typeof getDriverForUser>>["driver"] | null = null;
    try {
      if (previousHistoryId) {
        const result_driver = await getDriverForUser(conn.user_id, conn.id);
        driver = result_driver.driver;
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

    // ── Auto-route new threads to email groups ──────────────
    if (threadIds.length > 0) {
      try {
        // Step 1: Get group IDs for this connection (safe — no string interpolation)
        const { data: connGroups } = await admin
          .from("crm_email_groups")
          .select("id")
          .eq("connection_id", conn.id)
          .eq("user_id", conn.user_id);

        if (!connGroups?.length) return;

        const groupIds = connGroups.map((g) => g.id);

        // Step 2: Get contacts for those groups
        const { data: groupContacts } = await admin
          .from("crm_email_group_contacts")
          .select("group_id, email")
          .in("group_id", groupIds);

        if (!groupContacts?.length) return;

        const contactMap = new Map<string, string[]>();
        for (const gc of groupContacts) {
          const groups = contactMap.get(gc.email) ?? [];
          groups.push(gc.group_id);
          contactMap.set(gc.email, groups);
        }

        // Reuse driver from history fetch, or init if we didn't have one
        if (!driver) {
          const result_driver = await getDriverForUser(conn.user_id, conn.id);
          driver = result_driver.driver;
        }

        // Cap threads to avoid timeout, then process in parallel
        const capped = threadIds.slice(0, MAX_AUTO_ROUTE_THREADS);
        await Promise.allSettled(capped.map(async (threadId) => {
          const thread = await driver!.getThread(threadId);
          if (!thread?.messages?.length) return;

          // Safely extract from emails with null checks
          const fromEmails = [...new Set(
            thread.messages
              .filter((m: { from?: { email?: string } }) => m.from?.email)
              .map((m: { from: { email: string } }) => m.from.email.toLowerCase())
          )];

          const matchedGroupIds = new Set<string>();
          for (const email of fromEmails) {
            const gids = contactMap.get(email);
            if (gids) gids.forEach((id) => matchedGroupIds.add(id));
          }

          if (matchedGroupIds.size === 0) return;

          const lastMsg = thread.messages[thread.messages.length - 1];
          const fromEmail = lastMsg?.from?.email ?? "";
          const fromName = lastMsg?.from?.name ?? "";
          // Batch upserts for all matched groups in parallel
          await Promise.allSettled([...matchedGroupIds].map((groupId) =>
            admin
              .from("crm_email_group_threads")
              .upsert(
                {
                  group_id: groupId,
                  thread_id: threadId,
                  subject: thread.subject ?? null,
                  snippet: thread.snippet ?? null,
                  from_email: fromEmail,
                  from_name: fromName,
                  last_message_at: lastMsg?.date ?? new Date().toISOString(),
                  auto_added: true,
                },
                { onConflict: "group_id,thread_id" }
              )
          ));
        }));
      } catch (autoRouteErr) {
        // Non-critical — don't fail the webhook for auto-routing errors
        console.error("[gmail-webhook] Auto-routing error:", autoRouteErr);
      }
    }
  }));

  return NextResponse.json({ ok: true });
}
