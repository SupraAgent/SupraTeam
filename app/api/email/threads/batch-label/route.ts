import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDriverForUser } from "@/lib/email/driver";
import { sanitizeEmailError } from "@/lib/email/errors";

/**
 * POST /api/email/threads/batch-label
 *
 * Apply/remove labels across multiple threads in a single batch call.
 * Uses Gmail batchModify when available, falls back to per-thread modifyLabels.
 *
 * Body: { threadIds: string[], add: string[], remove: string[], connectionId?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { threadIds?: string[]; add?: string[]; remove?: string[]; connectionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { threadIds, add = [], remove = [], connectionId } = body;

  if (!threadIds || !Array.isArray(threadIds) || threadIds.length === 0) {
    return NextResponse.json({ error: "threadIds array required" }, { status: 400 });
  }
  if (threadIds.length > 100) {
    return NextResponse.json({ error: "Max 100 threads per batch" }, { status: 400 });
  }
  if (add.length === 0 && remove.length === 0) {
    return NextResponse.json({ error: "Must specify at least one label to add or remove" }, { status: 400 });
  }

  try {
    const { driver } = await getDriverForUser(auth.user.id, connectionId);

    // Use batchModifyLabels if available (Gmail driver), otherwise fall back to per-thread
    if ("batchModifyLabels" in driver && typeof driver.batchModifyLabels === "function") {
      await (driver as { batchModifyLabels: (ids: string[], add: string[], remove: string[]) => Promise<void> })
        .batchModifyLabels(threadIds, add, remove);
    } else {
      // Fallback: per-thread modification
      await Promise.allSettled(
        threadIds.map((id) => driver.modifyLabels(id, add, remove))
      );
    }

    return NextResponse.json({ data: { modified: threadIds.length } });
  } catch (err: unknown) {
    const { message, status } = sanitizeEmailError(err, "Failed to modify labels");
    return NextResponse.json({ error: message }, { status });
  }
}
