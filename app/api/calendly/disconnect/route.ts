import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import { deleteWebhookSubscription } from "@/lib/calendly/client";

/** DELETE: Disconnect Calendly — delete webhook + connection */
export async function DELETE() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`calendly-disconnect:${auth.user.id}`, { max: 3, windowSec: 60 });
  if (rl) return rl;

  try {
    const { data: conn } = await auth.admin
      .from("crm_calendly_connections")
      .select("id, webhook_subscription_uri, calendly_email")
      .eq("user_id", auth.user.id)
      .single();

    if (!conn) {
      return NextResponse.json({ error: "Calendly not connected" }, { status: 404 });
    }

    // Delete DB record first (same pattern as Google Calendar disconnect)
    await auth.admin
      .from("crm_calendly_connections")
      .delete()
      .eq("id", conn.id)
      .eq("user_id", auth.user.id);

    // Best-effort webhook cleanup
    if (conn.webhook_subscription_uri) {
      try {
        await deleteWebhookSubscription(auth.user.id, conn.webhook_subscription_uri);
      } catch {
        console.warn("[calendly/disconnect] Webhook cleanup failed (non-fatal)");
      }
    }

    // Audit log
    await auth.admin.from("crm_email_audit_log").insert({
      user_id: auth.user.id,
      action: "calendly_disconnected",
      metadata: { email: conn.calendly_email },
    });

    return NextResponse.json({ data: { disconnected: true }, source: "calendly" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Disconnect failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
