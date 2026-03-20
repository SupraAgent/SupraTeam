import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { serverCache, TTL } from "@/lib/email/server-cache";

/** GET: List email labels/folders */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  // Labels barely change — cache for 5 minutes on Railway
  const cacheKey = `labels:${auth.user.id}`;
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id);
    const labels = await driver.listLabels();

    serverCache.set(cacheKey, labels, TTL.LABELS);

    return NextResponse.json({ data: labels, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch labels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
