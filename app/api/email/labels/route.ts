import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";

/** GET: List email labels/folders */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const { driver } = await getDriverForUser(auth.user.id);
    const labels = await driver.listLabels();
    return NextResponse.json({ data: labels, source: "gmail" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch labels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
