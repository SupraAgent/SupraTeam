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

  // Count email tracking events (opens, clicks)
  const { count: totalOpens } = await supabase
    .from("crm_email_tracking_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("event_type", "open")
    .gte("created_at", sevenDaysAgo.toISOString());

  const { count: totalClicks } = await supabase
    .from("crm_email_tracking_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("event_type", "click")
    .gte("created_at", sevenDaysAgo.toISOString());

  // Count scheduled emails (sent vs pending)
  const { count: sentCount } = await supabase
    .from("crm_email_scheduled")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "sent")
    .gte("created_at", sevenDaysAgo.toISOString());

  const { count: pendingCount } = await supabase
    .from("crm_email_scheduled")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  // Count thread links (deals touched)
  const { count: dealsTouched } = await supabase
    .from("crm_email_thread_links")
    .select("deal_id", { count: "exact", head: true })
    .eq("linked_by", user.id)
    .not("deal_id", "is", null)
    .gte("linked_at", sevenDaysAgo.toISOString());

  // Get daily breakdown for sparkline (last 7 days)
  const dailyData: { date: string; opens: number; clicks: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const { count: dayOpens } = await supabase
      .from("crm_email_tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "open")
      .gte("created_at", dayStart.toISOString())
      .lt("created_at", dayEnd.toISOString());

    const { count: dayClicks } = await supabase
      .from("crm_email_tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "click")
      .gte("created_at", dayStart.toISOString())
      .lt("created_at", dayEnd.toISOString());

    dailyData.push({
      date: dayStart.toISOString().slice(0, 10),
      opens: dayOpens ?? 0,
      clicks: dayClicks ?? 0,
    });
  }

  const openRate = (sentCount ?? 0) > 0 ? ((totalOpens ?? 0) / (sentCount ?? 1)) * 100 : 0;
  const clickRate = (totalOpens ?? 0) > 0 ? ((totalClicks ?? 0) / (totalOpens ?? 1)) * 100 : 0;

  return NextResponse.json({
    data: {
      sent7d: sentCount ?? 0,
      pending: pendingCount ?? 0,
      opens7d: totalOpens ?? 0,
      clicks7d: totalClicks ?? 0,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      dealsTouched7d: dealsTouched ?? 0,
      daily: dailyData,
    },
  });
}
