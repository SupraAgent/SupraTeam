import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { triggerSync } from "@/lib/calendar/sync";
import { verifyWebhookToken } from "@/lib/calendar/google";

/**
 * POST: Google Calendar push notification webhook.
 * Google sends notifications when calendar events change.
 * We trigger an incremental sync for the affected calendar.
 *
 * Headers from Google:
 *  - X-Goog-Channel-ID: the channel ID we set up
 *  - X-Goog-Channel-Token: HMAC token we set during watch setup
 *  - X-Goog-Resource-ID: the resource being watched
 *  - X-Goog-Resource-State: "sync" (initial) or "exists" (change)
 */
export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  const resourceState = request.headers.get("x-goog-resource-state");

  // Acknowledge sync pings (initial verification) immediately
  if (resourceState === "sync") {
    return NextResponse.json({ ok: true });
  }

  // Google push notifications require always returning 200/204.
  // Non-200 causes retries (20x) then Google marks the endpoint unhealthy for ALL channels.
  // Log errors server-side but always return success.

  if (!channelId) {
    console.error("[calendar/webhook] Missing channel ID");
    return new NextResponse(null, { status: 200 });
  }

  if (!channelToken) {
    console.error("[calendar/webhook] Missing channel token for channel:", channelId);
    return new NextResponse(null, { status: 200 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    console.error("[calendar/webhook] Supabase not configured");
    return new NextResponse(null, { status: 200 });
  }

  try {
    // Parse channel ID to get connection info
    // Channel ID format: "cal:{connectionId}:{base64url-encoded calendarId}"
    const firstColon = channelId.indexOf(":");
    const secondColon = firstColon >= 0 ? channelId.indexOf(":", firstColon + 1) : -1;
    if (firstColon < 0 || secondColon < 0 || !channelId.startsWith("cal:")) {
      console.error("[calendar/webhook] Bad channel format:", channelId);
      return new NextResponse(null, { status: 200 });
    }

    const connectionId = channelId.substring(firstColon + 1, secondColon);
    const encodedCalId = channelId.substring(secondColon + 1);

    if (!connectionId || !encodedCalId) {
      console.error("[calendar/webhook] Empty connection or calendar ID:", channelId);
      return new NextResponse(null, { status: 200 });
    }

    // Decode base64url-encoded calendarId
    const calendarId = Buffer.from(encodedCalId, "base64url").toString("utf-8");

    // Verify HMAC token
    if (!verifyWebhookToken(connectionId, calendarId, channelToken)) {
      console.error("[calendar/webhook] Invalid HMAC token for channel:", channelId);
      return new NextResponse(null, { status: 200 });
    }

    // Look up the connection to get the user_id
    const { data: conn } = await admin
      .from("crm_calendar_connections")
      .select("user_id")
      .eq("id", connectionId)
      .eq("is_active", true)
      .single();

    if (!conn) {
      console.error("[calendar/webhook] Connection not found or inactive:", connectionId);
      return new NextResponse(null, { status: 200 });
    }

    // Trigger incremental sync (non-blocking)
    triggerSync(conn.user_id, connectionId, calendarId).catch((err) => {
      console.error("[calendar/webhook] Sync failed:", err instanceof Error ? err.message : "unknown");
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[calendar/webhook] Error:", err instanceof Error ? err.message : "unknown");
    return new NextResponse(null, { status: 200 });
  }
}
