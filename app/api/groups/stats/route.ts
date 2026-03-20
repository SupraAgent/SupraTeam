import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET: Refresh group activity stats (last_message_at, message counts, health_status)
 * Reads from crm_notifications (tg_message type) to compute activity.
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  // Get all groups
  const { data: groups } = await supabase
    .from("tg_groups")
    .select("id, bot_is_admin, last_message_at");

  if (!groups || groups.length === 0) {
    return NextResponse.json({ refreshed: 0 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let refreshed = 0;

  for (const group of groups) {
    // Count recent notifications (proxy for message activity)
    const [recent7, recent30, latest] = await Promise.all([
      supabase
        .from("crm_notifications")
        .select("id", { count: "exact", head: true })
        .eq("tg_group_id", group.id)
        .eq("type", "tg_message")
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("crm_notifications")
        .select("id", { count: "exact", head: true })
        .eq("tg_group_id", group.id)
        .eq("type", "tg_message")
        .gte("created_at", thirtyDaysAgo),
      supabase
        .from("crm_notifications")
        .select("created_at")
        .eq("tg_group_id", group.id)
        .eq("type", "tg_message")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const count7d = recent7.count ?? 0;
    const count30d = recent30.count ?? 0;
    const lastMsgAt = latest.data?.[0]?.created_at ?? group.last_message_at;

    // Compute health
    let health = "unknown";
    if (lastMsgAt) {
      const lastDate = new Date(lastMsgAt);
      if (lastDate >= twoDaysAgo && group.bot_is_admin) health = "active";
      else if (lastDate >= sevenDaysAgoDate && group.bot_is_admin) health = "quiet";
      else if (lastDate >= thirtyDaysAgoDate) health = "stale";
      else health = "dead";
    } else if (!group.bot_is_admin) {
      health = "stale";
    }

    const { error } = await supabase
      .from("tg_groups")
      .update({
        message_count_7d: count7d,
        message_count_30d: count30d,
        last_message_at: lastMsgAt ?? undefined,
        health_status: health,
      })
      .eq("id", group.id);

    if (!error) refreshed++;
  }

  return NextResponse.json({ refreshed, total: groups.length });
}
