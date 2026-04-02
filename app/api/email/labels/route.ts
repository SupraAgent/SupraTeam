import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { serverCache, TTL } from "@/lib/email/server-cache";
import { sanitizeEmailError } from "@/lib/email/errors";
import { createSupabaseAdmin } from "@/lib/supabase";

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

/** DELETE: Delete a Gmail label and its matching crm_email_groups row */
export async function DELETE(request: Request) {
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

    // Delete from Gmail
    if (driver.deleteLabel) {
      await driver.deleteLabel(labelId);
    }

    // Also remove matching crm_email_groups row if one exists
    const admin = createSupabaseAdmin();
    if (admin) {
      await admin
        .from("crm_email_groups")
        .delete()
        .eq("gmail_label_id", labelId)
        .eq("user_id", auth.user.id);
    }

    // Invalidate caches
    serverCache.invalidatePrefix(`labels:${auth.user.id}:`);

    return NextResponse.json({ data: { deleted: true } });
  } catch (err: unknown) {
    const { message, status, reconnect } = sanitizeEmailError(err, "Failed to delete label");
    return NextResponse.json({ error: message, reconnect }, { status });
  }
}
