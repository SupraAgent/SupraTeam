import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { logEmailAction } from "@/lib/email/audit";

/** GET: List user's scheduled email actions */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";

  const { data, error } = await auth.admin
    .from("crm_email_scheduled")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("status", status)
    .order("scheduled_for", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch scheduled" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** POST: Schedule a send-later, snooze, or follow-up reminder */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: {
    type: "send_later" | "snooze" | "follow_up_reminder";
    connection_id: string;
    thread_id?: string;
    draft_data?: Record<string, unknown>;
    scheduled_for: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.type || !body.scheduled_for || !body.connection_id) {
    return NextResponse.json({ error: "type, connection_id, and scheduled_for required" }, { status: 400 });
  }

  const validTypes = ["send_later", "snooze", "follow_up_reminder"];
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: "type must be send_later, snooze, or follow_up_reminder" }, { status: 400 });
  }

  const scheduledDate = new Date(body.scheduled_for);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "scheduled_for must be a valid date" }, { status: 400 });
  }
  if (scheduledDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: "scheduled_for must be in the future" }, { status: 400 });
  }

  // Verify connection ownership
  const { data: conn } = await auth.admin
    .from("crm_email_connections")
    .select("id")
    .eq("id", body.connection_id)
    .eq("user_id", auth.user.id)
    .single();

  if (!conn) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const { data, error } = await auth.admin
    .from("crm_email_scheduled")
    .insert({
      user_id: auth.user.id,
      connection_id: body.connection_id,
      type: body.type,
      thread_id: body.thread_id ?? null,
      draft_data: body.draft_data ?? null,
      scheduled_for: body.scheduled_for,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to schedule" }, { status: 500 });
  }

  // Audit log — fire-and-forget, don't block response
  logEmailAction(auth.admin, {
    userId: auth.user.id,
    action: `email_${body.type}`,
    threadId: body.thread_id,
    metadata: { scheduled_for: body.scheduled_for, connection_id: body.connection_id },
  });

  return NextResponse.json({ data, source: "supabase" });
}

/** DELETE: Cancel a scheduled action */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("crm_email_scheduled")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
