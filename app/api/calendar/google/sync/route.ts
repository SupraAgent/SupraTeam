import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { triggerSync } from "@/lib/calendar/sync";
import { rateLimit } from "@/lib/rate-limit";

/** POST: Trigger a calendar sync */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`cal-sync:${auth.user.id}`, { max: 5, windowSec: 60 });
  if (rl) return rl;

  try {
    const body = await request.json();
    const { connectionId, calendarId } = body as {
      connectionId?: string;
      calendarId?: string;
    };

    // Get connection if not specified, always verify ownership
    let connId = connectionId ?? "";
    if (!connId) {
      const { data: conn } = await auth.admin
        .from("crm_calendar_connections")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .order("connected_at", { ascending: true })
        .limit(1)
        .single();

      if (!conn) {
        return NextResponse.json(
          { error: "No calendar connection found" },
          { status: 404 }
        );
      }
      connId = conn.id as string;
    } else {
      // Verify the connection belongs to the authenticated user
      const { data: ownedConn } = await auth.admin
        .from("crm_calendar_connections")
        .select("id")
        .eq("id", connId)
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (!ownedConn) {
        return NextResponse.json(
          { error: "Connection not found" },
          { status: 404 }
        );
      }
    }

    const result = await triggerSync(
      auth.user.id,
      connId,
      calendarId ?? "primary"
    );

    return NextResponse.json({
      data: result,
      source: "google_calendar",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET: Get sync status for a calendar */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const { data: connections } = await auth.admin
      .from("crm_calendar_connections")
      .select("id, google_email, is_active, connected_at, selected_calendars, scopes")
      .eq("user_id", auth.user.id);

    if (!connections?.length) {
      return NextResponse.json({ data: { connections: [], syncStates: [] }, source: "db" });
    }

    const connectionIds = connections.map((c) => c.id);
    const { data: syncStates } = await auth.admin
      .from("crm_calendar_sync_state")
      .select("connection_id, calendar_id, sync_status, last_full_sync_at, last_incremental_sync_at, error_message")
      .in("connection_id", connectionIds);

    return NextResponse.json({
      data: {
        connections,
        syncStates: syncStates ?? [],
      },
      source: "db",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get sync status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
