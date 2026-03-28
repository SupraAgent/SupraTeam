/**
 * Send-time optimization: find the best UTC hour to send a message
 * based on historical reply patterns for a group.
 */

import { supabase } from "./supabase.js";

/**
 * Given a base send time (delay_hours from now), shift it to the nearest
 * optimal hour based on the group's reply pattern data.
 *
 * Returns adjusted ISO timestamp. If no data available, returns the raw delay.
 */
export async function getOptimalSendTime(
  tgGroupId: string | null,
  delayHours: number
): Promise<string> {
  const rawTime = new Date(Date.now() + delayHours * 3600000);

  if (!tgGroupId) return rawTime.toISOString();

  try {
    const { data: stats } = await supabase
      .from("crm_reply_hour_stats")
      .select("hour_utc, reply_count")
      .eq("tg_group_id", tgGroupId)
      .order("reply_count", { ascending: false })
      .limit(5);

    if (!stats || stats.length === 0) return rawTime.toISOString();

    // Find the best hour that's at or after the raw send time
    const rawHour = rawTime.getUTCHours();
    const bestHours = stats.map((s) => s.hour_utc);

    // Sort by proximity to raw hour (prefer not waiting too long)
    const scored = bestHours.map((h) => {
      let hoursAhead = h - rawHour;
      if (hoursAhead < 0) hoursAhead += 24;
      // Penalize waiting more than 6 hours — cap the optimization window
      const penalty = hoursAhead > 6 ? hoursAhead * 2 : 0;
      const replyScore = stats.find((s) => s.hour_utc === h)?.reply_count ?? 0;
      return { hour: h, hoursAhead, score: replyScore - penalty };
    });

    scored.sort((a, b) => b.score - a.score);
    const bestHour = scored[0];

    if (!bestHour || bestHour.hoursAhead > 12) {
      // Don't shift more than 12 hours — diminishing returns
      return rawTime.toISOString();
    }

    // Adjust the send time to the optimal hour
    const adjusted = new Date(rawTime);
    let hoursToAdd = bestHour.hour - rawHour;
    if (hoursToAdd < 0) hoursToAdd += 24;
    adjusted.setTime(adjusted.getTime() + hoursToAdd * 3600000);
    // Set to top of the hour for clean scheduling
    adjusted.setUTCMinutes(0, 0, 0);

    return adjusted.toISOString();
  } catch {
    return rawTime.toISOString();
  }
}
