import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";

type Params = { params: Promise<{ id: string }> };

/** GET: Get full thread with all messages */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const { driver } = await getDriverForUser(auth.user.id);
    const thread = await driver.getThread(id);

    // Mark as read on open
    await driver.markAsRead(id).catch(() => {});

    return NextResponse.json({ data: thread, source: "gmail" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch thread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST: Thread actions (archive, trash, star, read, unread, labels, snooze) */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: { action: string; labelIds?: { add?: string[]; remove?: string[] } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const { driver, connection } = await getDriverForUser(auth.user.id);

    switch (body.action) {
      case "archive":
        await driver.archive(id);
        break;
      case "trash":
        await driver.trash(id);
        break;
      case "star":
        await driver.toggleStar(id);
        break;
      case "read":
        await driver.markAsRead(id);
        break;
      case "unread":
        await driver.markAsUnread(id);
        break;
      case "labels":
        await driver.modifyLabels(
          id,
          body.labelIds?.add ?? [],
          body.labelIds?.remove ?? []
        );
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }

    // Audit log
    await auth.admin.from("crm_email_audit_log").insert({
      user_id: auth.user.id,
      action: `thread_${body.action}`,
      thread_id: id,
      metadata: { connection_email: connection.email },
    });

    return NextResponse.json({ ok: true, source: "gmail" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
