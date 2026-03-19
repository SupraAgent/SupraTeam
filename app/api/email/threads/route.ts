import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";

/** GET: List email threads (paginated, filterable) */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const labelIds = searchParams.get("labelIds")?.split(",").filter(Boolean);
  const query = searchParams.get("q") ?? undefined;
  const maxResults = parseInt(searchParams.get("maxResults") ?? "25", 10);
  const pageToken = searchParams.get("pageToken") ?? undefined;
  const connectionId = searchParams.get("connectionId") ?? undefined;

  try {
    const { driver } = await getDriverForUser(auth.user.id, connectionId);
    const result = await driver.listThreads({
      labelIds,
      query,
      maxResults,
      pageToken,
    });

    return NextResponse.json({ data: result, source: "gmail" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch threads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
