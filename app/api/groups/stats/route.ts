import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET: Refresh group activity stats (last_message_at, message counts, health_status, message_history)
 * Reads from crm_notifications (tg_message type) to compute activity.
 * Auto-archives dead groups when auto_archive_enabled is true.
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // Get all groups
  const { data: groups } = await supabase
    .from("tg_groups")
    .select("id, bot_is_admin, last_message_at, is_archived, auto_archive_enabled");

  if (!groups || groups.length === 0) {
    return NextResponse.json({ refreshed: 0 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtySevenDaysAgoDate = new Date(now.getTime() - 37 * 24 * 60 * 60 * 1000);

  let refreshed = 0;
  let archived = 0;

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

    // Build message_history: daily counts for last 30 days
    const { data: dailyCounts } = await supabase.rpc("get_group_daily_message_counts", {
      p_group_id: group.id,
      p_since: thirtyDaysAgo,
    });

    // If the RPC doesn't exist, fall back to building from individual queries
    let messageHistory: { date: string; count: number }[] = [];
    if (dailyCounts && Array.isArray(dailyCounts)) {
      messageHistory = dailyCounts.map((row: { day: string; count: number }) => ({
        date: row.day,
        count: row.count,
      }));
    } else {
      // Fallback: query notifications and aggregate client-side
      const { data: recentMessages } = await supabase
        .from("crm_notifications")
        .select("created_at")
        .eq("tg_group_id", group.id)
        .eq("type", "tg_message")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true });

      if (recentMessages && recentMessages.length > 0) {
        const countsByDay: Record<string, number> = {};
        for (const msg of recentMessages) {
          const day = msg.created_at.substring(0, 10); // YYYY-MM-DD
          countsByDay[day] = (countsByDay[day] ?? 0) + 1;
        }
        messageHistory = Object.entries(countsByDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count }));
      }
    }

    const updatePayload: Record<string, unknown> = {
      message_count_7d: count7d,
      message_count_30d: count30d,
      last_message_at: lastMsgAt ?? undefined,
      health_status: health,
      message_history: messageHistory,
    };

    // Auto-archive: dead groups with auto_archive_enabled and last_message_at older than 37 days
    if (
      health === "dead" &&
      group.auto_archive_enabled === true &&
      !group.is_archived &&
      lastMsgAt &&
      new Date(lastMsgAt) < thirtySevenDaysAgoDate
    ) {
      updatePayload.is_archived = true;
      updatePayload.archived_at = now.toISOString();
      archived++;
    }

    const { error } = await supabase
      .from("tg_groups")
      .update(updatePayload)
      .eq("id", group.id);

    if (!error) refreshed++;
  }

  return NextResponse.json({ refreshed, total: groups.length, auto_archived: archived });
}
