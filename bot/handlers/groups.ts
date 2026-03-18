import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

export function registerGroupHandlers(bot: Bot) {
  // Fires when the bot's membership status in a chat changes
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.myChatMember.chat;
    const newStatus = ctx.myChatMember.new_chat_member.status;
    const chatType = chat.type;

    // Only handle group/supergroup/channel
    if (chatType !== "group" && chatType !== "supergroup" && chatType !== "channel") {
      return;
    }

    const chatId = chat.id;
    const chatTitle = "title" in chat ? chat.title : `Chat ${chatId}`;
    const isAdmin = newStatus === "administrator";
    const isMember = newStatus === "member";
    const isRemoved = newStatus === "left" || newStatus === "kicked";

    if (isAdmin || isMember) {
      const { error } = await supabase.from("tg_groups").upsert(
        {
          telegram_group_id: chatId,
          group_name: chatTitle,
          group_type: chatType,
          bot_is_admin: isAdmin,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_group_id" }
      );

      if (error) {
        console.error("[bot/groups] upsert error:", error);
      } else {
        console.log(`[bot/groups] ${isAdmin ? "Admin" : "Member"} in: ${chatTitle} (${chatId})`);
      }
    } else if (isRemoved) {
      const { error } = await supabase
        .from("tg_groups")
        .update({ bot_is_admin: false, updated_at: new Date().toISOString() })
        .eq("telegram_group_id", chatId);

      if (error) {
        console.error("[bot/groups] update error:", error);
      } else {
        console.log(`[bot/groups] Removed from: ${chatTitle} (${chatId})`);
      }
    }
  });
}
