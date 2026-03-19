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

        // Send welcome message when bot is added as admin
        if (isAdmin) {
          try {
            const { data: tpl } = await supabase
              .from("crm_bot_templates")
              .select("body_template")
              .eq("template_key", "welcome_group")
              .eq("is_active", true)
              .single();

            const welcomeMsg = tpl?.body_template ??
              "SupraCRM Bot is now active in this group.\n\nI'll send deal updates and pipeline notifications here. Use /deal to see linked deals.";
            await ctx.reply(welcomeMsg);
          } catch {
            // Non-critical — don't block group registration
          }
        }
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
