import type { Bot, CommandContext, Context } from "grammy";
import { supabase } from "../lib/supabase.js";

export function registerCommands(bot: Bot) {
  bot.command("start", async (ctx) => {
    const payload = ctx.match?.toString().trim();

    // Handle QR code deeplink: /start qr_<id>
    if (payload && payload.startsWith("qr_")) {
      await handleQrScan(ctx, payload);
      return;
    }

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

    // Verify sender is a linked CRM team member
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", ctx.from?.id)
      .single();
    if (!profile) {
      await ctx.reply("This command is only available to CRM team members.");
      return;
    }

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

    // Verify sender is a linked CRM team member
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", ctx.from?.id)
      .single();
    if (!profile) {
      await ctx.reply("This command is only available to CRM team members.");
      return;
    }

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

/* ─── QR Code Scan Handler ─── */

async function handleQrScan(ctx: CommandContext<Context>, payload: string) {
  // Extract QR code ID: payload is "qr_<uuid-without-dashes>"
  const rawId = payload.slice(3); // remove "qr_"
  // Re-insert dashes into UUID: 8-4-4-4-12
  const qrId = rawId.length === 32
    ? `${rawId.slice(0, 8)}-${rawId.slice(8, 12)}-${rawId.slice(12, 16)}-${rawId.slice(16, 20)}-${rawId.slice(20)}`
    : rawId;

  const tgUser = ctx.from;
  if (!tgUser) return;

  // Fetch the QR code config
  const { data: qr, error: qrErr } = await supabase
    .from("crm_qr_codes")
    .select("*")
    .eq("id", qrId)
    .single();

  if (qrErr || !qr) {
    await ctx.reply("This QR code is no longer valid.");
    return;
  }

  // Check active, expired, max scans
  if (!qr.is_active) {
    await ctx.reply("This QR code has been deactivated.");
    return;
  }
  if (qr.expires_at && new Date(qr.expires_at) < new Date()) {
    await ctx.reply("This QR code has expired.");
    return;
  }
  if (qr.max_scans && qr.scan_count >= qr.max_scans) {
    await ctx.reply("This QR code has reached its scan limit.");
    return;
  }

  // Record the scan, create contact/deal, and welcome the user.
  // Note: Telegram Bot API does not support creating groups programmatically.
  // Group creation is handled by the CRM web app (via GramJS client sessions)
  // or manually by the team. The bot records the scan and notifies the team.
  await recordQrScan(qrId, tgUser, null, qr);

  const welcomeText = qr.welcome_message
    ? `<b>Welcome!</b>\n\nYou've connected via <b>${qr.name}</b>.\n\n${qr.welcome_message}`
    : `<b>Welcome!</b>\n\nYou've connected via <b>${qr.name}</b>.\nOur team has been notified and will add you to a dedicated group shortly.`;

  await ctx.reply(welcomeText, { parse_mode: "HTML" });
}

async function recordQrScan(
  qrCodeId: string,
  tgUser: { id: number; username?: string; first_name?: string },
  groupId: string | null,
  qr: Record<string, unknown>
) {
  // Record the scan
  await supabase.from("crm_qr_scans").insert({
    qr_code_id: qrCodeId,
    telegram_user_id: tgUser.id,
    telegram_username: tgUser.username ?? null,
    telegram_first_name: tgUser.first_name ?? null,
    group_id: groupId,
  });

  // Increment scan count
  await supabase
    .from("crm_qr_codes")
    .update({ scan_count: ((qr.scan_count as number) ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", qrCodeId);

  // Auto-create contact if we have enough info
  const contactName = tgUser.first_name ?? tgUser.username ?? "Unknown";
  const { data: existingContact } = await supabase
    .from("crm_contacts")
    .select("id")
    .eq("telegram_user_id", tgUser.id)
    .maybeSingle();

  let contactId = existingContact?.id;

  if (!contactId) {
    const { data: newContact } = await supabase
      .from("crm_contacts")
      .insert({
        name: contactName,
        telegram_username: tgUser.username ?? null,
        telegram_user_id: tgUser.id,
        source: "telegram_bot",
        created_by: qr.created_by,
      })
      .select("id")
      .single();

    contactId = newContact?.id;
  }

  // Auto-create deal if configured
  if (qr.auto_create_deal && contactId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .insert({
        title: `${contactName} (via ${qr.name})`,
        contact_id: contactId,
        stage_id: qr.deal_stage_id ?? null,
        board_type: qr.deal_board_type ?? "bd",
        source: (qr.campaign_source as string) ?? "qr_scan",
        assigned_to: qr.created_by,
      })
      .select("id")
      .single();

    // Update scan record with contact and deal IDs
    if (deal) {
      await supabase
        .from("crm_qr_scans")
        .update({ contact_id: contactId, deal_id: deal.id })
        .eq("qr_code_id", qrCodeId)
        .eq("telegram_user_id", tgUser.id)
        .order("scanned_at", { ascending: false })
        .limit(1);
    }
  } else if (contactId) {
    await supabase
      .from("crm_qr_scans")
      .update({ contact_id: contactId })
      .eq("qr_code_id", qrCodeId)
      .eq("telegram_user_id", tgUser.id)
      .order("scanned_at", { ascending: false })
      .limit(1);
  }
}
