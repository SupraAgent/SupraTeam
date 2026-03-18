import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

export function registerCommands(bot: Bot) {
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

    const groups = groupsRes.count ?? 0;
    const deals = dealsRes.count ?? 0;

    await ctx.reply(
      `SupraCRM Bot Status\n\n` +
      `Groups administered: ${groups}\n` +
      `Active deals: ${deals}`
    );
  });

  bot.command("deals", async (ctx) => {
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, name, position")
      .order("position");

    const { data: deals } = await supabase
      .from("crm_deals")
      .select("stage_id");

    if (!stages || !deals || deals.length === 0) {
      await ctx.reply("No active deals in the pipeline.");
      return;
    }

    const countByStage: Record<string, number> = {};
    for (const deal of deals) {
      if (deal.stage_id) {
        countByStage[deal.stage_id] = (countByStage[deal.stage_id] ?? 0) + 1;
      }
    }

    const lines = stages.map((s) => {
      const count = countByStage[s.id] ?? 0;
      return `${s.position}. ${s.name}: ${count}`;
    });

    await ctx.reply(`Pipeline Summary (${deals.length} total)\n\n${lines.join("\n")}`);
  });
}
