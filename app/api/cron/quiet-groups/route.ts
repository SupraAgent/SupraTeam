/**
 * GET /api/cron/quiet-groups
 * Cron job: detect quiet/stale groups and trigger re-engagement.
 * - Finds groups with health_status = "quiet" or "stale"
 * - Checks if a re-engagement was already sent within the cooldown period
 * - Sends a configurable message via the bot
 * - Logs the action to crm_group_reengagement
 */

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { verifyCron } from "@/lib/cron-auth";

const QUIET_COOLDOWN_DAYS = 7; // Don't re-engage same group within 7 days
const STALE_COOLDOWN_DAYS = 14;

const QUIET_MESSAGE = "Hey team! It's been a bit quiet here. Any updates to share? Let's keep the momentum going!";
const STALE_MESSAGE = "Hi everyone — this group has been inactive for a while. If there are any updates or blockers, please share them here. We want to make sure nothing falls through the cracks.";

export async function GET(request: Request) {
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ error: "No bot token configured" }, { status: 503 });
  }

  // Find quiet and stale groups (not archived, bot is admin)
  const { data: groups, error } = await supabase
    .from("tg_groups")
    .select("id, telegram_group_id, group_name, health_status, last_message_at")
    .in("health_status", ["quiet", "stale"])
    .eq("bot_is_admin", true)
    .eq("is_archived", false);

  if (error) {
    console.error("[cron/quiet-groups] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!groups || groups.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0 });
  }

  let sent = 0;
  let skipped = 0;

  for (const group of groups) {
    const cooldownDays = group.health_status === "stale" ? STALE_COOLDOWN_DAYS : QUIET_COOLDOWN_DAYS;
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();

    // Check cooldown — was a re-engagement already sent recently?
    const { data: recent } = await supabase
      .from("crm_group_reengagement")
      .select("id")
      .eq("group_id", group.id)
      .gte("triggered_at", cooldownDate)
      .limit(1);

    if (recent && recent.length > 0) {
      skipped++;
      continue;
    }

    // Send re-engagement message
    const message = group.health_status === "stale" ? STALE_MESSAGE : QUIET_MESSAGE;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: group.telegram_group_id,
            text: message,
          }),
        }
      );
      const data = await res.json();

      if (data.ok) {
        // Only log re-engagement on successful send (so cooldown doesn't block retries)
        await supabase.from("crm_group_reengagement").insert({
          group_id: group.id,
          health_status: group.health_status,
          message_sent: message,
          sent_by: "system",
          triggered_at: new Date().toISOString(),
        });
        sent++;
      } else {
        console.error("[cron/quiet-groups] send failed:", group.group_name, data.description);
        skipped++;
      }
    } catch (err) {
      console.error("[cron/quiet-groups] error:", group.group_name, err);
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, total_quiet: groups.length });
}
