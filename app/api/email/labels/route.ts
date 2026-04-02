import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { serverCache, TTL } from "@/lib/email/server-cache";
import { sanitizeEmailError } from "@/lib/email/errors";

/** DELETE: Delete a user-created label/group */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const labelId = searchParams.get("labelId");
  const connectionId = searchParams.get("connectionId") ?? undefined;

  if (!labelId) {
    return NextResponse.json({ error: "labelId required" }, { status: 400 });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id, connectionId);
    await driver.deleteLabel?.(labelId);
    // Invalidate labels cache
    serverCache.invalidatePrefix(`labels:${auth.user.id}:`);
    return NextResponse.json({ data: { deleted: true } });
  } catch (err: unknown) {
    const { message, status } = sanitizeEmailError(err, "Failed to delete label");
    return NextResponse.json({ error: message }, { status });
  }
}

/** GET: List email labels/folders */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connectionId") ?? undefined;

  // Labels barely change — cache for 5 minutes on Railway
  const cacheKey = `labels:${auth.user.id}:${connectionId ?? "default"}`;
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id, connectionId);
    const labels = await driver.listLabels();

    serverCache.set(cacheKey, labels, TTL.LABELS);

    return NextResponse.json({ data: labels, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Failed to fetch labels");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
