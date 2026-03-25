import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

export function registerGroupHandlers(bot: Bot) {
  // Handle group → supergroup migration
  // When a group is converted, Telegram sends migrate_to_chat_id in the old group
  bot.on("message", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg) return next();

    // Old group sends migrate_to_chat_id with the new supergroup ID
    if ("migrate_to_chat_id" in msg && msg.migrate_to_chat_id) {
      const oldChatId = msg.chat.id;
      const newChatId = msg.migrate_to_chat_id;
      const chatTitle = "title" in msg.chat ? msg.chat.title : `Chat ${oldChatId}`;

      console.log(`[bot/groups] Migration: ${chatTitle} ${oldChatId} → ${newChatId}`);

      // Update the existing record with the new supergroup ID
      const { error } = await supabase
        .from("tg_groups")
        .update({
          telegram_group_id: newChatId,
          group_type: "supergroup",
          updated_at: new Date().toISOString(),
        })
        .eq("telegram_group_id", oldChatId);

      if (error) {
        // Record might not exist for old ID — create new one
        await supabase.from("tg_groups").upsert({
          telegram_group_id: newChatId,
          group_name: chatTitle,
          group_type: "supergroup",
          bot_is_admin: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "telegram_group_id" });
      }

      // Generate invite link for the new supergroup
      try {
        const inviteLink = await ctx.api.exportChatInviteLink(newChatId);
        await supabase
          .from("tg_groups")
          .update({ invite_link: inviteLink, updated_at: new Date().toISOString() })
          .eq("telegram_group_id", newChatId);
        console.log(`[bot/groups] Migrated invite link: ${inviteLink}`);
      } catch {
        try {
          const result = await ctx.api.createChatInviteLink(newChatId, { name: "SupraCRM" });
          await supabase
            .from("tg_groups")
            .update({ invite_link: result.invite_link, updated_at: new Date().toISOString() })
            .eq("telegram_group_id", newChatId);
        } catch (e) {
          console.error("[bot/groups] Could not generate invite link after migration:", e);
        }
      }

      // Update any workflows that reference the old chat_id
      const { data: workflows } = await supabase
        .from("crm_workflows")
        .select("id, nodes")
        .eq("is_active", true);

      if (workflows) {
        for (const wf of workflows) {
          const nodes = (wf.nodes ?? []) as { data?: { config?: { chat_id?: string } } }[];
          let changed = false;
          for (const node of nodes) {
            if (node.data?.config?.chat_id === String(oldChatId)) {
              node.data.config.chat_id = String(newChatId);
              changed = true;
            }
          }
          if (changed) {
            await supabase.from("crm_workflows").update({ nodes }).eq("id", wf.id);
            console.log(`[bot/groups] Updated workflow ${wf.id} chat_id ${oldChatId} → ${newChatId}`);
          }
        }
      }

      // Update any deals linked to the old chat
      await supabase
        .from("crm_deals")
        .update({ telegram_chat_id: newChatId })
        .eq("telegram_chat_id", oldChatId);

      return; // Don't process as a regular message
    }

    return next();
  });

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

        // When bot is made admin: generate invite link + send welcome
        if (isAdmin) {
          // Generate invite link and save to DB
          try {
            const inviteLink = await ctx.api.exportChatInviteLink(chatId);
            await supabase
              .from("tg_groups")
              .update({ invite_link: inviteLink, updated_at: new Date().toISOString() })
              .eq("telegram_group_id", chatId);
            console.log(`[bot/groups] Invite link for ${chatTitle}: ${inviteLink}`);
          } catch (linkErr) {
            // Try createChatInviteLink as fallback
            try {
              const result = await ctx.api.createChatInviteLink(chatId, { name: "SupraCRM" });
              await supabase
                .from("tg_groups")
                .update({ invite_link: result.invite_link, updated_at: new Date().toISOString() })
                .eq("telegram_group_id", chatId);
              console.log(`[bot/groups] Created invite link for ${chatTitle}: ${result.invite_link}`);
            } catch {
              console.error("[bot/groups] Could not generate invite link:", linkErr);
            }
          }

          // Send welcome message
          try {
            const { data: tpl } = await supabase
              .from("crm_bot_templates")
              .select("body_template")
              .eq("template_key", "welcome_group")
              .eq("is_active", true)
              .single();

            const welcomeMsg = tpl?.body_template ??
              "Hi! I'm SupraAdmin bot, here to assist.";
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
