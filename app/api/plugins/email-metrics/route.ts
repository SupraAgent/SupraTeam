import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * GET /api/plugins/email-metrics
 * Returns aggregated email metrics: sent/received counts, response rate, avg reply time.
 * Uses email tracking events and scheduled email data.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  // Get tracking events for the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Run all independent queries in parallel
  const [
    { count: totalOpens },
    { count: totalClicks },
    { count: sentCount },
    { count: pendingCount },
    { count: dealsTouched },
    { data: dailyEvents },
  ] = await Promise.all([
    supabase
      .from("crm_email_tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "open")
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("crm_email_tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "click")
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("crm_email_scheduled")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "sent")
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("crm_email_scheduled")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("crm_email_thread_links")
      .select("deal_id", { count: "exact", head: true })
      .eq("linked_by", user.id)
      .not("deal_id", "is", null)
      .gte("linked_at", sevenDaysAgo.toISOString()),
    supabase
      .from("crm_email_tracking_events")
      .select("event_type, created_at")
      .eq("user_id", user.id)
      .in("event_type", ["open", "click"])
      .gte("created_at", sevenDaysAgo.toISOString()),
  ]);

  // Build daily buckets from the single query result
  const dailyMap = new Map<string, { opens: number; clicks: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyMap.set(d.toISOString().slice(0, 10), { opens: 0, clicks: 0 });
  }
  for (const event of dailyEvents ?? []) {
    const dateKey = event.created_at.slice(0, 10);
    const bucket = dailyMap.get(dateKey);
    if (bucket) {
      if (event.event_type === "open") bucket.opens++;
      else if (event.event_type === "click") bucket.clicks++;
    }
  }
  const dailyData = Array.from(dailyMap.entries()).map(([date, counts]) => ({
    date,
    ...counts,
  }));

  const sent = sentCount ?? 0;
  const opens = totalOpens ?? 0;
  const clicks = totalClicks ?? 0;
  const openRate = sent > 0 ? (opens / sent) * 100 : 0;
  const clickRate = opens > 0 ? (clicks / opens) * 100 : 0;

  return NextResponse.json({
    data: {
      sent7d: sent,
      pending: pendingCount ?? 0,
      opens7d: opens,
      clicks7d: clicks,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      dealsTouched7d: dealsTouched ?? 0,
      daily: dailyData,
    },
  });
}
