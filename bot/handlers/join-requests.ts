/**
 * Join request handler — processes chat_join_request events.
 * Auto-approves if the user is a known CRM contact or team member.
 * Otherwise notifies the assigned rep for manual approval.
 */

import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { escapeHtml } from "../../lib/telegram-templates.js";

export function registerJoinRequestHandler(bot: Bot) {
  bot.on("chat_join_request", async (ctx) => {
    const request = ctx.chatJoinRequest;
    const chatId = request.chat.id;
    const userId = request.from.id;
    const userName = request.from.first_name + (request.from.last_name ? ` ${request.from.last_name}` : "");
    const username = request.from.username ?? null;

    // Check if user is a known team member
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", userId)
      .single();

    if (profile) {
      // Auto-approve team members
      try {
        await ctx.approveChatJoinRequest(userId);
        console.log(`[bot/join-requests] Auto-approved team member ${userName} (${userId}) in chat ${chatId}`);
      } catch (err) {
        console.error("[bot/join-requests] Failed to approve team member:", err);
      }
      return;
    }

    // Check if user is a known CRM contact
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("telegram_user_id", userId)
      .single();

    if (contact) {
      // Auto-approve known contacts
      try {
        await ctx.approveChatJoinRequest(userId);
        console.log(`[bot/join-requests] Auto-approved contact ${contact.name} (${userId}) in chat ${chatId}`);
      } catch (err) {
        console.error("[bot/join-requests] Failed to approve contact:", err);
      }
      return;
    }

    // Unknown user — log the request for manual review
    const chatTitle = "title" in request.chat ? request.chat.title : `Chat ${chatId}`;
    console.log(`[bot/join-requests] Pending: ${userName} (@${username}) wants to join ${chatTitle}`);

    // Find the deal assigned rep for this group and notify them
    const { data: tgGroup } = await supabase
      .from("tg_groups")
      .select("id")
      .eq("telegram_group_id", chatId)
      .single();

    if (tgGroup) {
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("assigned_to")
        .eq("tg_group_id", tgGroup.id)
        .not("assigned_to", "is", null)
        .limit(1);

      if (deals?.[0]?.assigned_to) {
        const { data: assignee } = await supabase
          .from("profiles")
          .select("telegram_id")
          .eq("id", deals[0].assigned_to)
          .single();

        if (assignee?.telegram_id) {
          try {
            await bot.api.sendMessage(
              Number(assignee.telegram_id),
              `🔔 <b>Join Request</b>\n\n${escapeHtml(userName)}${username ? ` (@${username})` : ""} wants to join <b>${escapeHtml(chatTitle)}</b>.\n\nPlease approve or decline in Telegram.`,
              { parse_mode: "HTML" }
            );
          } catch {
            // Non-critical — rep may not have started bot
          }
        }
      }
    }
  });
}
