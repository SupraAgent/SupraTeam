import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

export function registerCommands(bot: Bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "<b>Welcome to SupraTeam Bot!</b>\n\n" +
      "I help manage your CRM pipeline and Telegram groups.\n\n" +
      "<b>Commands</b>\n" +
      "/help — Show available commands\n" +
      "/status — Bot status and group count\n" +
      "/deals — Active deals summary",
      { parse_mode: "HTML" }
    );
  });

  bot.command("help", async (ctx) => {
    if (ctx.chat.type === "private") {
      await ctx.reply(
        "<b>SupraTeam Bot Commands</b>\n\n" +
        "/start — Welcome message\n" +
        "/help — This help text\n" +
        "/status — Groups administered, pipeline stats\n" +
        "/deals — Active deals by stage",
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply(
        "<b>Available Commands</b>\n\n" +
        "/contact — Show your Supra point of contact\n" +
        "/help — This help text",
        { parse_mode: "HTML" }
      );
    }
  });

  bot.command("contact", async (ctx) => {
    if (ctx.chat.type === "private") return; // Only works in groups

    const chatId = ctx.chat.id;
    const { data: tgGroup } = await supabase
      .from("tg_groups")
      .select("id")
      .eq("telegram_group_id", chatId)
      .single();

    if (!tgGroup) return;

    const { data: linkedDeals } = await supabase
      .from("crm_deals")
      .select("assigned_to")
      .eq("tg_group_id", tgGroup.id)
      .not("assigned_to", "is", null)
      .limit(5);

    if (!linkedDeals || linkedDeals.length === 0) {
      await ctx.reply("No team member assigned yet. We'll get someone connected shortly.");
      return;
    }

    const assignedIds = [...new Set(linkedDeals.map((d) => d.assigned_to).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, crm_role")
      .in("id", assignedIds);

    if (!profiles || profiles.length === 0) {
      await ctx.reply("No team member assigned yet. We'll get someone connected shortly.");
      return;
    }

    const roleLabels: Record<string, string> = { bd_lead: "BD", marketing_lead: "Marketing", admin_lead: "Admin" };
    const contactLines = profiles.map((p) => {
      const role = p.crm_role ? ` (${roleLabels[p.crm_role] ?? p.crm_role})` : "";
      return `• ${p.display_name}${role}`;
    });

    await ctx.reply(
      `<b>Your Supra point of contact:</b>\n\n${contactLines.join("\n")}`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("status", async (ctx) => {
    if (ctx.chat.type !== "private") return; // CRM data only in private chats

    const [groupsRes, dealsRes, contactsRes] = await Promise.all([
      supabase.from("tg_groups").select("id", { count: "exact", head: true }).eq("bot_is_admin", true),
      supabase.from("crm_deals").select("id", { count: "exact", head: true }),
      supabase.from("crm_contacts").select("id", { count: "exact", head: true }),
    ]);

    const groups = groupsRes.count ?? 0;
    const deals = dealsRes.count ?? 0;
    const contacts = contactsRes.count ?? 0;

    await ctx.reply(
      "<b>SupraTeam Bot Status</b>\n\n" +
      `Groups administered: <b>${groups}</b>\n` +
      `Active deals: <b>${deals}</b>\n` +
      `Contacts: <b>${contacts}</b>`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("deals", async (ctx) => {
    if (ctx.chat.type !== "private") return; // CRM data only in private chats

    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, name, position")
      .order("position");

    const { data: deals } = await supabase
      .from("crm_deals")
      .select("stage_id, board_type, value");

    if (!stages || !deals || deals.length === 0) {
      await ctx.reply("No active deals in the pipeline.");
      return;
    }

    const countByStage: Record<string, number> = {};
    let totalValue = 0;
    const boardCounts: Record<string, number> = {};

    for (const deal of deals) {
      if (deal.stage_id) {
        countByStage[deal.stage_id] = (countByStage[deal.stage_id] ?? 0) + 1;
      }
      if (deal.value) totalValue += deal.value;
      const board = deal.board_type ?? "Unknown";
      boardCounts[board] = (boardCounts[board] ?? 0) + 1;
    }

    const stageLines = stages.map((s) => {
      const count = countByStage[s.id] ?? 0;
      return `  ${s.name}: <b>${count}</b>`;
    });

    const boardLine = Object.entries(boardCounts)
      .map(([b, c]) => `${b}: ${c}`)
      .join(" | ");

    await ctx.reply(
      `<b>Pipeline Summary</b> (${deals.length} total)\n\n` +
      `<b>By Stage</b>\n${stageLines.join("\n")}\n\n` +
      `<b>By Board</b>\n  ${boardLine}\n\n` +
      `<b>Total Value</b>: $${Math.round(totalValue).toLocaleString()}`,
      { parse_mode: "HTML" }
    );
  });
}
