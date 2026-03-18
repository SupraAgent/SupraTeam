import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

export function registerMessageHandlers(bot: Bot) {
  // Listen for all text messages in groups
  bot.on("message:text", async (ctx) => {
    const chat = ctx.chat;

    // Only process group/supergroup messages
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const chatId = chat.id;
    const messageId = ctx.message.message_id;
    const senderName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : "");
    const messageText = ctx.message.text;

    try {
      // Find the tg_group record
      const { data: tgGroup } = await supabase
        .from("tg_groups")
        .select("id, group_name")
        .eq("telegram_group_id", chatId)
        .single();

      if (!tgGroup) return; // Not a registered group

      // Find deals linked to this telegram chat
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, board_type, stage_id")
        .eq("telegram_chat_id", chatId);

      if (!deals || deals.length === 0) return; // No deals linked to this chat

      // Create a notification for each linked deal
      for (const deal of deals) {
        // Build deep link: t.me/c/{chat_id without -100 prefix}/{message_id}
        const privateChatId = String(chatId).replace(/^-100/, "");
        const tgDeepLink = `https://t.me/c/${privateChatId}/${messageId}`;

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
    } catch (err) {
      console.error("[bot/messages] error:", err);
    }
  });
}
