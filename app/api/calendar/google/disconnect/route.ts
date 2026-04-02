import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { decryptToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { stopWebhookChannel } from "@/lib/calendar/sync";

/** DELETE: Disconnect Google Calendar — revoke tokens & delete cached data */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`cal-disconnect:${auth.user.id}`, { max: 3, windowSec: 60 });
  if (rl) return rl;

  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("connectionId");

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    // Fetch the connection to get the token for revocation
    const { data: conn } = await auth.admin
      .from("crm_calendar_connections")
      .select("id, access_token_encrypted, refresh_token_encrypted, google_email")
      .eq("id", connectionId)
      .eq("user_id", auth.user.id)
      .single();

    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Delete DB records FIRST so that even if external cleanup fails (webhook stop
    // times out, token revocation fails), the webhook handler won't find the connection
    // and orphaned channels will expire harmlessly within 24 hours.

    // Decrypt tokens before deleting the connection row (needed for revocation below)
    let tokenToRevoke: string | null = null;
    try {
      tokenToRevoke = conn.refresh_token_encrypted
        ? decryptToken(conn.refresh_token_encrypted)
        : decryptToken(conn.access_token_encrypted);
    } catch {
      // Decryption failure is non-fatal — we can still clean up DB records
    }

    // Delete cached events for this connection
    await auth.admin
      .from("crm_calendar_events")
      .delete()
      .eq("connection_id", connectionId)
      .eq("user_id", auth.user.id);

    // Delete sync state (use verified conn.id from ownership check, not raw param)
    await auth.admin
      .from("crm_calendar_sync_state")
      .delete()
      .eq("connection_id", conn.id);

    // Delete the connection itself
    await auth.admin
      .from("crm_calendar_connections")
      .delete()
      .eq("id", connectionId)
      .eq("user_id", auth.user.id);

    // Best-effort external cleanup AFTER DB is clean.
    // Even if these fail, the webhook handler won't find the connection.
    try {
      await stopWebhookChannel(auth.user.id, conn.id);
    } catch {
      console.warn("[calendar/disconnect] Webhook channel cleanup failed (non-fatal)");
    }

    try {
      if (tokenToRevoke) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `token=${encodeURIComponent(tokenToRevoke)}`,
        });
      }
    } catch {
      console.warn("[calendar/disconnect] Token revocation failed (non-fatal)");
    }

    // Audit log
    await auth.admin.from("crm_email_audit_log").insert({
      user_id: auth.user.id,
      action: "calendar_disconnected",
      metadata: { email: conn.google_email },
    });

    return NextResponse.json({ data: { disconnected: true }, source: "google_calendar" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Disconnect failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
