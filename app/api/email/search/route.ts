import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";

/** GET: Search emails */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const maxResults = parseInt(searchParams.get("maxResults") ?? "25", 10);

  if (!q) {
    return NextResponse.json({ error: "q (query) is required" }, { status: 400 });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id);
    const result = await driver.search(q, maxResults);
    return NextResponse.json({ data: result, source: "gmail" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
