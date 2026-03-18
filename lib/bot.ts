import { Bot } from "grammy";
import { createClient } from "@supabase/supabase-js";

let botInstance: Bot | null = null;

export function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  if (!botInstance) {
    botInstance = new Bot(token);
    registerAllHandlers(botInstance);
  }
  return botInstance;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function registerAllHandlers(bot: Bot) {
  const supabase = getSupabase();
  if (!supabase) return;

  // --- Commands ---
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Welcome to SupraCRM Bot!\n\n" +
      "I help manage your CRM pipeline and Telegram groups.\n\n" +
      "Commands:\n" +
      "/help - Show available commands\n" +
      "/status - Bot status and group count\n" +
      "/deals - Active deals summary"
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "SupraCRM Bot Commands:\n\n" +
      "/start - Welcome message\n" +
      "/help - This help text\n" +
      "/status - How many groups I admin, pipeline stats\n" +
      "/deals - Active deals by stage"
    );
  });

  bot.command("status", async (ctx) => {
    const [groupsRes, dealsRes] = await Promise.all([
      supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_is_admin", true),
      supabase.from("crm_deals").select("id", { count: "exact", head: true }),
    ]);
    await ctx.reply(
      `SupraCRM Bot Status\n\n` +
      `Groups administered: ${groupsRes.count ?? 0}\n` +
      `Active deals: ${dealsRes.count ?? 0}`
    );
  });

  bot.command("deals", async (ctx) => {
    const { data: stages } = await supabase.from("pipeline_stages").select("id, name, position").order("position");
    const { data: deals } = await supabase.from("crm_deals").select("stage_id");

    if (!stages || !deals || deals.length === 0) {
      await ctx.reply("No active deals in the pipeline.");
      return;
    }

    const countByStage: Record<string, number> = {};
    for (const deal of deals) {
      if (deal.stage_id) countByStage[deal.stage_id] = (countByStage[deal.stage_id] ?? 0) + 1;
    }

    const lines = stages.map((s) => `${s.position}. ${s.name}: ${countByStage[s.id] ?? 0}`);
    await ctx.reply(`Pipeline Summary (${deals.length} total)\n\n${lines.join("\n")}`);
  });

  // --- Group membership changes ---
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.myChatMember.chat;
    const newStatus = ctx.myChatMember.new_chat_member.status;
    const chatType = chat.type;

    if (chatType !== "group" && chatType !== "supergroup" && chatType !== "channel") return;

    const chatId = chat.id;
    const chatTitle = "title" in chat ? chat.title : `Chat ${chatId}`;
    const isAdmin = newStatus === "administrator";
    const isMember = newStatus === "member";
    const isRemoved = newStatus === "left" || newStatus === "kicked";

    if (isAdmin || isMember) {
      await supabase.from("tg_groups").upsert(
        {
          telegram_group_id: chatId,
          group_name: chatTitle,
          group_type: chatType,
          bot_is_admin: isAdmin,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_group_id" }
      );
      console.log(`[bot] ${isAdmin ? "Admin" : "Member"} in: ${chatTitle}`);
    } else if (isRemoved) {
      await supabase
        .from("tg_groups")
        .update({ bot_is_admin: false, updated_at: new Date().toISOString() })
        .eq("telegram_group_id", chatId);
      console.log(`[bot] Removed from: ${chatTitle}`);
    }
  });

  // --- Group messages -> notifications ---
  bot.on("message:text", async (ctx) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const chatId = chat.id;
    const messageId = ctx.message.message_id;
    const senderName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : "");
    const messageText = ctx.message.text;

    try {
      const { data: tgGroup } = await supabase
        .from("tg_groups")
        .select("id, group_name")
        .eq("telegram_group_id", chatId)
        .single();

      if (!tgGroup) return;

      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name")
        .eq("telegram_chat_id", chatId);

      if (!deals || deals.length === 0) return;

      for (const deal of deals) {
        const privateChatId = String(chatId).replace(/^-100/, "");
        await supabase.from("crm_notifications").insert({
          type: "tg_message",
          deal_id: deal.id,
          tg_group_id: tgGroup.id,
          title: `${senderName} in ${tgGroup.group_name}`,
          body: messageText.length > 200 ? messageText.slice(0, 200) + "..." : messageText,
          tg_deep_link: `https://t.me/c/${privateChatId}/${messageId}`,
          tg_sender_name: senderName,
          pipeline_link: `/pipeline?highlight=${deal.id}`,
        });
      }
    } catch (err) {
      console.error("[bot/messages] error:", err);
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error("[bot] Error:", err.message);
  });
}
