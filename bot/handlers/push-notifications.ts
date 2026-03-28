/**
 * TMA Push Notifications — sends DMs to assigned reps with deep link buttons.
 *
 * Privacy: Push notifications are ONLY sent as DMs to the assigned rep.
 * Message previews are truncated. Deal names are safe because the rep is assigned.
 * Never sends push notifications to group chats.
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

const TMA_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";

// Rate limit: max 1 push per trigger type per deal per user per 5 minutes
const RATE_LIMIT_MS = 5 * 60 * 1000;

interface PushParams {
  userId: string; // CRM user ID (profiles.id)
  triggerType: "stage_change" | "tg_message" | "escalation" | "outreach_reply";
  title: string;
  body: string;
  tmaPath: string; // e.g. "/tma/deals/abc-123"
  dealId?: string;
}

/**
 * Look up user's Telegram ID from profiles and check if push is enabled.
 * Returns null if user has no telegram_id or push is disabled.
 */
async function resolveRecipient(
  userId: string,
  triggerType: PushParams["triggerType"]
): Promise<{ telegramId: number } | null> {
  // Get profile with telegram_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_id")
    .eq("id", userId)
    .single();

  if (!profile?.telegram_id) return null;

  // Check notification preferences
  const { data: prefs } = await supabase
    .from("crm_notification_preferences")
    .select("push_enabled, push_stage_changes, push_tg_messages, push_escalations, push_outreach_replies")
    .eq("user_id", userId)
    .single();

  // Default: all enabled if no preferences set
  const pushEnabled = prefs?.push_enabled ?? true;
  if (!pushEnabled) return null;

  // Check per-type preference
  const typeEnabled = (() => {
    if (!prefs) return true; // No prefs = all enabled
    switch (triggerType) {
      case "stage_change": return prefs.push_stage_changes ?? true;
      case "tg_message": return prefs.push_tg_messages ?? true;
      case "escalation": return prefs.push_escalations ?? true;
      case "outreach_reply": return prefs.push_outreach_replies ?? true;
    }
  })();

  if (!typeEnabled) return null;

  // Check quiet hours
  const { data: quietPrefs } = await supabase
    .from("crm_notification_preferences")
    .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_tz")
    .eq("user_id", userId)
    .single();

  if (quietPrefs?.quiet_hours_enabled && quietPrefs.quiet_hours_start && quietPrefs.quiet_hours_end) {
    const now = new Date();
    const tz = quietPrefs.quiet_hours_tz ?? "UTC";
    const formatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    const currentTime = formatter.format(now);
    const start = quietPrefs.quiet_hours_start.slice(0, 5); // "HH:MM"
    const end = quietPrefs.quiet_hours_end.slice(0, 5);

    // Simple range check (handles overnight ranges like 22:00-08:00)
    if (start <= end) {
      if (currentTime >= start && currentTime < end) return null;
    } else {
      if (currentTime >= start || currentTime < end) return null;
    }
  }

  return { telegramId: Number(profile.telegram_id) };
}

/**
 * Rate limit check: don't send the same type of push for the same deal
 * to the same user within RATE_LIMIT_MS.
 */
async function isRateLimited(userId: string, triggerType: string, dealId?: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_MS).toISOString();

  let query = supabase
    .from("crm_push_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("trigger_type", triggerType)
    .gte("sent_at", cutoff);

  if (dealId) {
    query = query.eq("deal_id", dealId);
  }

  const { count } = await query;
  return (count ?? 0) > 0;
}

/**
 * Send a TMA push notification as a Telegram DM with an inline "Open in CRM" button.
 */
export async function sendTMAPush(bot: Bot, params: PushParams): Promise<boolean> {
  const { userId, triggerType, title, body, tmaPath, dealId } = params;

  try {
    // Resolve recipient
    const recipient = await resolveRecipient(userId, triggerType);
    if (!recipient) return false;

    // Rate limit check
    if (await isRateLimited(userId, triggerType, dealId)) {
      return false;
    }

    // Truncate body for privacy
    const truncatedBody = body.length > 100 ? body.slice(0, 100) + "..." : body;

    // Build message text (plain text, not HTML — safe for DMs)
    const messageText = `${title}\n\n${truncatedBody}`;

    // Build TMA deep link URL
    const tmaUrl = `${TMA_BASE_URL}${tmaPath}`;

    // Send DM with inline keyboard button
    await bot.api.sendMessage(recipient.telegramId, messageText, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Open in CRM", web_app: { url: tmaUrl } },
        ]],
      },
    });

    // Log the push
    await supabase.from("crm_push_log").insert({
      user_id: userId,
      telegram_user_id: recipient.telegramId,
      trigger_type: triggerType,
      deal_id: dealId ?? null,
      title,
      body: truncatedBody,
      tma_path: tmaPath,
      delivered: true,
    });

    console.log(`[push] Sent ${triggerType} push to user ${userId} (tg:${recipient.telegramId})`);
    return true;
  } catch (err) {
    console.error(`[push] Failed to send ${triggerType} push to user ${userId}:`, err);

    // Log failed attempt
    try {
      const { data: profile } = await supabase.from("profiles").select("telegram_id").eq("id", userId).single();
      if (profile?.telegram_id) {
        await supabase.from("crm_push_log").insert({
          user_id: userId,
          telegram_user_id: Number(profile.telegram_id),
          trigger_type: triggerType,
          deal_id: dealId ?? null,
          title,
          body: body.slice(0, 100),
          tma_path: tmaPath,
          delivered: false,
        });
      }
    } catch {
      // Swallow — best effort logging
    }

    return false;
  }
}

/**
 * Convenience: push to a deal's assigned rep.
 * Returns false if deal has no assigned_to.
 */
export async function pushToDealAssignee(
  bot: Bot,
  dealId: string,
  triggerType: PushParams["triggerType"],
  title: string,
  body: string,
  tmaPath?: string
): Promise<boolean> {
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("assigned_to")
    .eq("id", dealId)
    .single();

  if (!deal?.assigned_to) return false;

  return sendTMAPush(bot, {
    userId: deal.assigned_to,
    triggerType,
    title,
    body,
    tmaPath: tmaPath ?? `/tma/deals/${dealId}`,
    dealId,
  });
}
