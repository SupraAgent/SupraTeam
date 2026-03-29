import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { serverCache, TTL } from "@/lib/email/server-cache";

/** GET: List email threads (paginated, filterable) */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const labelIds = searchParams.get("labelIds")?.split(",").filter(Boolean);
  const query = searchParams.get("q") ?? undefined;
  const maxResults = Math.min(Math.max(1, parseInt(searchParams.get("maxResults") ?? "25", 10)), 100);
  const pageToken = searchParams.get("pageToken") ?? undefined;
  const connectionId = searchParams.get("connectionId") ?? undefined;

  // Server-side cache (Railway persistent process)
  const cacheKey = `threads:${auth.user.id}:${labelIds?.join(",") ?? ""}:${query ?? ""}:${maxResults}:${pageToken ?? ""}`;
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id, connectionId);
    const result = await driver.listThreads({
      labelIds,
      query,
      maxResults,
      pageToken,
    });

    serverCache.set(cacheKey, result, TTL.THREAD_LIST);

    return NextResponse.json({ data: result, source: "gmail" }, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch threads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
