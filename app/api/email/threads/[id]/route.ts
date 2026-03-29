import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { serverCache, TTL } from "@/lib/email/server-cache";
import { logEmailAction } from "@/lib/email/audit";
import { sanitizeEmailError } from "@/lib/email/errors";

type Params = { params: Promise<{ id: string }> };

/** GET: Get full thread with all messages */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connection_id") ?? undefined;

  // Server-side cache for full threads (Railway persistent process)
  const cacheKey = `thread:${auth.user.id}:${connectionId ?? "default"}:${id}`;
  const cached = serverCache.get(cacheKey);
  if (cached) {
    // Still mark as read in background
    getDriverForUser(auth.user.id, connectionId).then(({ driver }) => driver.markAsRead(id)).catch(() => {});
    return NextResponse.json({ data: cached, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id, connectionId);
    const thread = await driver.getThread(id);

    // Mark as read on open — fire-and-forget, don't block response
    driver.markAsRead(id).catch(() => {});

    serverCache.set(cacheKey, thread, TTL.THREAD_FULL);

    return NextResponse.json({ data: thread, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Failed to fetch thread");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}

/** POST: Thread actions (archive, trash, star, read, unread, labels, snooze) */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: { action: string; currentlyStarred?: boolean; labelIds?: { add?: string[]; remove?: string[] }; bulkId?: string };
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
        await driver.toggleStar(id, body.currentlyStarred);
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
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // Invalidate server-side caches after mutation
    serverCache.invalidatePrefix(`thread:${auth.user.id}:`);
    serverCache.invalidatePrefix(`threads:${auth.user.id}:`);

    // Audit log — fire-and-forget, don't block response
    logEmailAction(auth.admin, {
      userId: auth.user.id,
      action: `thread_${body.action}`,
      threadId: id,
      metadata: { connection_email: connection.email },
      bulkId: body.bulkId,
    });

    return NextResponse.json({ ok: true, source: "gmail" });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Action failed");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
