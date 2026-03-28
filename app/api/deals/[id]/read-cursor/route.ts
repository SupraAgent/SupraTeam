import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * POST /api/deals/[id]/read-cursor
 * Mark all messages as read for the current user on this deal.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  const { error } = await admin.rpc("upsert_deal_read_cursor", {
    p_user_id: user.id,
    p_deal_id: id,
    p_last_read_at: new Date().toISOString(),
  });

  if (error) {
    // Fallback: direct upsert if RPC doesn't exist yet
    const { error: fallbackErr } = await admin
      .from("crm_deal_read_cursors")
      .upsert(
        { user_id: user.id, deal_id: id, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,deal_id" }
      );
    if (fallbackErr) {
      return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
