import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

/**
 * Fire workflow automations for tg_message triggers.
 * Uses dynamic import to avoid bundling the workflow engine in the bot process.
 */
async function fireWorkflowTriggers(payload: Record<string, unknown>) {
  try {
    const { triggerWorkflowsByEvent } = await import("../../lib/workflow-engine");
    await triggerWorkflowsByEvent("tg_message", payload);
  } catch (err) {
    console.error("[bot/messages] workflow trigger error:", err);
  }
}

export function registerMessageHandlers(bot: Bot) {
  // Listen for all text messages in groups
  bot.on("message:text", async (ctx) => {
    const chat = ctx.chat;

    // Only process group/supergroup messages
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const chatId = chat.id;
    const messageId = ctx.message.message_id;
    const senderName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : "");
    const senderUsername = ctx.from.username ?? "";
    const messageText = ctx.message.text;

    // Build deep link — only works for supergroups (-100XXXX format)
    const chatIdStr = String(chatId);
    let tgDeepLink = "";
    if (chatIdStr.startsWith("-100")) {
      const supergroupId = chatIdStr.slice(4); // strip "-100"
      tgDeepLink = `https://t.me/c/${supergroupId}/${messageId}`;
    } else if (chat.type === "supergroup" && "username" in chat && chat.username) {
      tgDeepLink = `https://t.me/${chat.username}/${messageId}`;
    }

    try {
      // Find the tg_group record
      const { data: tgGroup } = await supabase
        .from("tg_groups")
        .select("id, group_name")
        .eq("telegram_group_id", chatId)
        .single();

      if (!tgGroup) return; // Not a registered group

      // Fire workflow automations (non-blocking)
      fireWorkflowTriggers({
        chat_id: String(chatId),
        group_name: tgGroup.group_name,
        sender_name: senderName,
        sender_username: senderUsername,
        message_text: messageText,
        message_link: tgDeepLink,
        tg_group_id: tgGroup.id,
      });

      // Find deals linked to this telegram chat
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, board_type, stage_id")
        .eq("telegram_chat_id", chatId);

      if (!deals || deals.length === 0) return; // No deals linked to this chat

      // Store full message in tg_group_messages for conversation timeline
      await supabase.from("tg_group_messages").upsert({
        tg_group_id: tgGroup.id,
        telegram_message_id: messageId,
        telegram_chat_id: chatId,
        sender_telegram_id: ctx.from.id,
        sender_name: senderName,
        sender_username: senderUsername || null,
        message_text: messageText,
        message_type: "text",
        reply_to_message_id: ctx.message.reply_to_message?.message_id ?? null,
        sent_at: new Date(ctx.message.date * 1000).toISOString(),
        is_from_bot: false,
      }, { onConflict: "telegram_chat_id,telegram_message_id" });

      // Create a notification for each linked deal
      for (const deal of deals) {
        await supabase.from("crm_notifications").insert({
          type: "tg_message",
          deal_id: deal.id,
          tg_group_id: tgGroup.id,
          title: `${senderName} in ${tgGroup.group_name}`,
          body: messageText.length > 200 ? messageText.slice(0, 200) + "..." : messageText,
          tg_deep_link: tgDeepLink,
          tg_sender_name: senderName,
          pipeline_link: `/pipeline?highlight=${deal.id}`,
        });
      }
      // Check for active outreach enrollments targeting this chat (reply detection)
      try {
        const { data: activeEnrollments } = await supabase
          .from("crm_outreach_enrollments")
          .select("id, reply_count")
          .eq("tg_chat_id", String(chatId))
          .eq("status", "active");

        if (activeEnrollments && activeEnrollments.length > 0) {
          for (const enrollment of activeEnrollments) {
            await supabase.from("crm_outreach_enrollments").update({
              last_reply_at: new Date().toISOString(),
              reply_count: (enrollment.reply_count ?? 0) + 1,
            }).eq("id", enrollment.id);
          }
        }
      } catch (replyErr) {
        console.error("[bot/messages] reply detection error:", replyErr);
      }
    } catch (err) {
      console.error("[bot/messages] error:", err);
    }
  });
}
