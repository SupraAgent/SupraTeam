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
// Hard timeout for per-connection processing — Pub/Sub redelivers after ~10s
const CONNECTION_TIMEOUT_MS = 8_000;

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[gmail-webhook] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
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

  let body: { message?: { data?: string; messageId?: string; publishTime?: string }; subscription?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.message?.data) {
    return NextResponse.json({ ok: true }); // Ack empty messages
  }

  // Reject stale Pub/Sub messages older than 5 minutes to mitigate replay attacks
  if (body.message.publishTime) {
    const publishedAt = new Date(body.message.publishTime).getTime();
    if (!isNaN(publishedAt) && Date.now() - publishedAt > 5 * 60 * 1000) {
      console.error("[gmail-webhook] Rejecting stale message published at:", body.message.publishTime);
      return NextResponse.json({ ok: true }); // Ack to stop retries but don't process
    }
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
  await Promise.allSettled(connections.map((conn) => withTimeout(async function processConnection() {
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
    } catch (historyErr) {
      // Don't advance historyId on failure — leave it unchanged so the next
      // push notification can retry from the same position. Advancing on
      // failure (e.g., expired token) permanently loses those notifications.
      console.error("[gmail-webhook] listHistory failed for connection", conn.id, ":", historyErr);
      return;
    }

    // ── Auto-route new threads to email groups ──────────────
    if (threadIds.length > 0) {
      try {
        const { data: connGroups } = await admin
          .from("crm_email_groups")
          .select("id, gmail_label_id")
          .eq("connection_id", conn.id)
          .eq("user_id", conn.user_id);

        if (connGroups?.length) {
          const groupIds = connGroups.map((g) => g.id);
          const gmailLabelMap = new Map<string, string>();
          for (const g of connGroups) {
            if (g.gmail_label_id) gmailLabelMap.set(g.id, g.gmail_label_id);
          }

          const { data: groupContacts } = await admin
            .from("crm_email_group_contacts")
            .select("group_id, email")
            .in("group_id", groupIds);

          if (groupContacts?.length) {
            const contactMap = new Map<string, string[]>();
            for (const gc of groupContacts) {
              const groups = contactMap.get(gc.email) ?? [];
              groups.push(gc.group_id);
              contactMap.set(gc.email, groups);
            }

            // Ensure driver is available for auto-routing
            if (!driver) {
              try {
                const result_driver = await getDriverForUser(conn.user_id, conn.id);
                driver = result_driver.driver;
              } catch (driverErr) {
                console.error("[gmail-webhook] Failed to init driver for auto-routing:", driverErr);
              }
            }

            if (driver) {
              const capped = threadIds.slice(0, MAX_AUTO_ROUTE_THREADS);
              const routeDriver = driver; // Capture non-null reference for closure

              // Phase 1: Fetch thread details to determine contact matches
              const BATCH_SIZE = 5;
              const threadDetails: { threadId: string; matchedGroupIds: Set<string>; fromEmail: string; fromName: string; subject: string; snippet: string; date: string }[] = [];
              for (let i = 0; i < capped.length; i += BATCH_SIZE) {
                const batch = capped.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(batch.map(async (threadId) => {
                  const thread = await routeDriver.getThread(threadId);
                  if (!thread?.messages?.length) return null;

                  const fromEmails = [...new Set(
                    thread.messages
                      .filter((m) => m.from?.email)
                      .map((m) => m.from.email.toLowerCase())
                  )];

                  const matchedGroupIds = new Set<string>();
                  for (const email of fromEmails) {
                    const gids = contactMap.get(email);
                    if (gids) gids.forEach((id) => matchedGroupIds.add(id));
                  }
                  if (matchedGroupIds.size === 0) return null;

                  const lastMsg = thread.messages[thread.messages.length - 1];
                  return {
                    threadId,
                    matchedGroupIds,
                    fromEmail: lastMsg?.from?.email ?? "",
                    fromName: lastMsg?.from?.name ?? "",
                    subject: thread.subject ?? "",
                    snippet: thread.snippet ?? "",
                    date: lastMsg?.date ?? new Date().toISOString(),
                  };
                }));
                for (const r of results) {
                  if (r.status === "fulfilled" && r.value) threadDetails.push(r.value);
                }
              }

              // Phase 2: Batch label operations — group threads by label for batchModifyLabels
              const labelToThreads = new Map<string, string[]>();
              const imapUpserts: { group_id: string; thread_id: string; subject: string | null; snippet: string | null; from_email: string; from_name: string; last_message_at: string; auto_added: boolean }[] = [];

              for (const td of threadDetails) {
                for (const groupId of td.matchedGroupIds) {
                  const labelId = gmailLabelMap.get(groupId);
                  if (labelId) {
                    const list = labelToThreads.get(labelId) ?? [];
                    list.push(td.threadId);
                    labelToThreads.set(labelId, list);
                  } else {
                    imapUpserts.push({
                      group_id: groupId,
                      thread_id: td.threadId,
                      subject: td.subject || null,
                      snippet: td.snippet || null,
                      from_email: td.fromEmail,
                      from_name: td.fromName,
                      last_message_at: td.date,
                      auto_added: true,
                    });
                  }
                }
              }

              // Use batchModifyLabels for Gmail groups (1 API call per label vs N per thread)
              const hasBatchModify = "batchModifyLabels" in routeDriver && typeof routeDriver.batchModifyLabels === "function";
              await Promise.allSettled([
                ...Array.from(labelToThreads.entries()).map(([labelId, tids]) =>
                  hasBatchModify
                    ? (routeDriver as { batchModifyLabels: (ids: string[], add: string[], remove: string[]) => Promise<void> }).batchModifyLabels(tids, [labelId], [])
                    : Promise.allSettled(tids.map((tid) => routeDriver.modifyLabels(tid, [labelId], [])))
                ),
                ...(imapUpserts.length > 0
                  ? [admin.from("crm_email_group_threads").upsert(imapUpserts, { onConflict: "group_id,thread_id" })]
                  : []),
              ]);
            }
          }
        }
      } catch (autoRouteErr) {
        console.error("[gmail-webhook] Auto-routing error:", autoRouteErr);
      }
    }

    // Persist push event + advance historyId AFTER auto-routing completes
    // so threads aren't lost if auto-routing fails partway through.
    const { error: pushErr } = await admin.from("crm_email_push_events").insert({
      user_id: conn.user_id,
      email: payload.emailAddress,
      history_id: newHistoryId,
      thread_ids: threadIds,
    });

    if (pushErr) {
      console.error("[gmail-webhook] Failed to insert push event:", pushErr.message);
      return; // Don't advance historyId — retry on next push
    }

    await admin
      .from("crm_email_connections")
      .update({ watch_history_id: newHistoryId })
      .eq("id", conn.id)
      .eq("user_id", conn.user_id);
  }(), CONNECTION_TIMEOUT_MS, `conn:${conn.id}`))).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[gmail-webhook] Connection processing failed:", r.reason);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
