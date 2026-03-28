import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/deals/unread-counts
 * Returns unread message counts per deal for the current user.
 * Used by the Kanban board to show unread badges on deal cards.
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  const { data, error } = await admin.rpc("get_deal_unread_counts", {
    p_user_id: user.id,
  });

  if (error) {
    // Fallback: manual query if RPC doesn't exist yet
    const { data: fallback, error: fbErr } = await admin
      .from("crm_deals")
      .select("id, telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    if (fbErr || !fallback) {
      return NextResponse.json({ counts: {} });
    }

    // Get cursors for this user
    const { data: cursors } = await admin
      .from("crm_deal_read_cursors")
      .select("deal_id, last_read_at")
      .eq("user_id", user.id);

    const cursorMap: Record<string, string> = {};
    for (const c of cursors ?? []) {
      cursorMap[c.deal_id] = c.last_read_at;
    }

    const counts: Record<string, number> = {};
    for (const deal of fallback) {
      const lastRead = cursorMap[deal.id] || "1970-01-01T00:00:00Z";
      const { count } = await admin
        .from("tg_group_messages")
        .select("id", { count: "exact", head: true })
        .eq("telegram_chat_id", deal.telegram_chat_id)
        .gt("sent_at", lastRead);
      if (count && count > 0) {
        counts[deal.id] = count;
      }
    }

    return NextResponse.json({ counts });
  }

  // Convert array to map
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.deal_id] = Number(row.unread_count);
  }

  return NextResponse.json({ counts });
}
