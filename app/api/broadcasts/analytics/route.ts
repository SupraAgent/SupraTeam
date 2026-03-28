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
    .select("id, status, sent_count, failed_count, group_count, slug_filter, sender_name, sent_at, created_at, message_text, variant_b_message, response_count, response_rate")
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

  // Response metrics
  const totalResponses = all.reduce((s, b) => s + (b.response_count ?? 0), 0);
  const avgResponseRate = totalSent > 0
    ? Math.round(all.reduce((s, b) => s + (b.response_rate ?? 0), 0) / Math.max(all.filter((b) => b.sent_count > 0).length, 1) * 100) / 100
    : 0;

  // A/B test results — broadcasts with variant_b_message
  const abBroadcastIds = all.filter((b) => b.variant_b_message).map((b) => b.id);
  let abResults: Array<{
    broadcast_id: string;
    message_preview: string;
    variant_a: { sent: number; responded: number; rate: number };
    variant_b: { sent: number; responded: number; rate: number };
  }> = [];

  if (abBroadcastIds.length > 0) {
    const { data: abRecipients } = await supabase
      .from("crm_broadcast_recipients")
      .select("broadcast_id, variant, status, responded_at")
      .in("broadcast_id", abBroadcastIds);

    const abMap = new Map<string, { a_sent: number; a_responded: number; b_sent: number; b_responded: number }>();
    for (const r of abRecipients ?? []) {
      if (!abMap.has(r.broadcast_id)) abMap.set(r.broadcast_id, { a_sent: 0, a_responded: 0, b_sent: 0, b_responded: 0 });
      const entry = abMap.get(r.broadcast_id)!;
      if (r.status === "sent") {
        if (r.variant === "B") { entry.b_sent++; if (r.responded_at) entry.b_responded++; }
        else { entry.a_sent++; if (r.responded_at) entry.a_responded++; }
      }
    }

    abResults = abBroadcastIds.map((id) => {
      const broadcast = all.find((b) => b.id === id);
      const stats = abMap.get(id) ?? { a_sent: 0, a_responded: 0, b_sent: 0, b_responded: 0 };
      return {
        broadcast_id: id,
        message_preview: (broadcast?.message_text ?? "").slice(0, 60),
        variant_a: {
          sent: stats.a_sent,
          responded: stats.a_responded,
          rate: stats.a_sent > 0 ? Math.round((stats.a_responded / stats.a_sent) * 100) : 0,
        },
        variant_b: {
          sent: stats.b_sent,
          responded: stats.b_responded,
          rate: stats.b_sent > 0 ? Math.round((stats.b_responded / stats.b_sent) * 100) : 0,
        },
      };
    });
  }

  // Best send time heatmap (response rate by hour of day)
  const hourlyStats: Record<number, { sent: number; responded: number }> = {};
  for (const b of all) {
    if (!b.sent_at || !b.sent_count) continue;
    const hour = new Date(b.sent_at).getUTCHours();
    if (!hourlyStats[hour]) hourlyStats[hour] = { sent: 0, responded: 0 };
    hourlyStats[hour].sent += b.sent_count ?? 0;
    hourlyStats[hour].responded += b.response_count ?? 0;
  }

  const bestSendTime = Object.entries(hourlyStats)
    .map(([hour, stats]) => ({
      hour: Number(hour),
      sent: stats.sent,
      responded: stats.responded,
      responseRate: stats.sent > 0 ? Math.round((stats.responded / stats.sent) * 100) : 0,
    }))
    .sort((a, b) => a.hour - b.hour);

  return NextResponse.json({
    overview: {
      totalBroadcasts,
      totalSent,
      totalFailed,
      deliveryRate,
      totalResponses,
      avgResponseRate,
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
    abResults,
    bestSendTime,
  });
}
