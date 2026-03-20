/**
 * GET /api/broadcasts/analytics — Campaign analytics: delivery rates, volume trends, slug performance
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  // All broadcasts
  const { data: broadcasts } = await supabase
    .from("crm_broadcasts")
    .select("id, status, sent_count, failed_count, group_count, slug_filter, sender_name, sent_at, created_at")
    .order("created_at", { ascending: false });

  const all = broadcasts ?? [];

  // Overall stats
  const totalBroadcasts = all.length;
  const totalSent = all.reduce((s, b) => s + (b.sent_count ?? 0), 0);
  const totalFailed = all.reduce((s, b) => s + (b.failed_count ?? 0), 0);
  const totalAttempted = totalSent + totalFailed;
  const deliveryRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 0;

  // Broadcasts this week vs last week
  const now = Date.now();
  const weekMs = 7 * 86_400_000;
  const thisWeek = all.filter((b) => new Date(b.created_at).getTime() > now - weekMs).length;
  const lastWeek = all.filter((b) => {
    const t = new Date(b.created_at).getTime();
    return t > now - 2 * weekMs && t <= now - weekMs;
  }).length;

  // By slug
  const slugStats: Record<string, { count: number; sent: number; failed: number }> = {};
  for (const b of all) {
    const slug = b.slug_filter ?? "(no slug)";
    if (!slugStats[slug]) slugStats[slug] = { count: 0, sent: 0, failed: 0 };
    slugStats[slug].count++;
    slugStats[slug].sent += b.sent_count ?? 0;
    slugStats[slug].failed += b.failed_count ?? 0;
  }

  // By sender
  const senderStats: Record<string, number> = {};
  for (const b of all) {
    const sender = b.sender_name ?? "Unknown";
    senderStats[sender] = (senderStats[sender] ?? 0) + 1;
  }

  // Daily volume (last 30 days)
  const dailyVolume: Record<string, number> = {};
  for (const b of all) {
    const day = (b.sent_at ?? b.created_at).slice(0, 10);
    dailyVolume[day] = (dailyVolume[day] ?? 0) + 1;
  }

  // Top performing (highest delivery rate)
  const byStatus = {
    sent: all.filter((b) => b.status === "sent").length,
    scheduled: all.filter((b) => b.status === "scheduled").length,
    failed: all.filter((b) => b.status === "failed").length,
    cancelled: all.filter((b) => b.status === "cancelled").length,
  };

  return NextResponse.json({
    overview: {
      totalBroadcasts,
      totalSent,
      totalFailed,
      deliveryRate,
      thisWeek,
      lastWeek,
      weeklyChange: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : thisWeek > 0 ? 100 : 0,
    },
    byStatus,
    slugStats: Object.entries(slugStats)
      .map(([slug, stats]) => ({ slug, ...stats, deliveryRate: stats.sent + stats.failed > 0 ? Math.round((stats.sent / (stats.sent + stats.failed)) * 100) : 0 }))
      .sort((a, b) => b.count - a.count),
    senderStats: Object.entries(senderStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    dailyVolume: Object.entries(dailyVolume)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30),
  });
}
