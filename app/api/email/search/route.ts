import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { sanitizeEmailError } from "@/lib/email/errors";

/** GET: Search emails */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const maxResults = Math.min(Math.max(1, parseInt(searchParams.get("maxResults") ?? "25", 10)), 100);

  if (!q) {
    return NextResponse.json({ error: "q (query) is required" }, { status: 400 });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id);
    const result = await driver.search(q, maxResults);
    return NextResponse.json({ data: result, source: "gmail" });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Search failed");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
