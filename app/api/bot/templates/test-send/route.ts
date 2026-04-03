/**
 * POST /api/bot/templates/test-send — Send a rendered template preview to a Telegram chat
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { renderTemplate } from "@/lib/telegram-templates";
import { sendTelegramWithTracking } from "@/lib/telegram-send";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 503 });
  }

  const { template_key, chat_id, custom_body } = await request.json();

  if (!template_key && !custom_body) {
    return NextResponse.json({ error: "template_key or custom_body required" }, { status: 400 });
  }
  if (!chat_id) {
    return NextResponse.json({ error: "chat_id is required" }, { status: 400 });
  }

  // Get template body
  let body = custom_body;
  if (!body && template_key) {
    const { data: tpl } = await supabase
      .from("crm_bot_templates")
      .select("body_template, available_variables")
      .eq("template_key", template_key)
      .single();

    if (!tpl) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    body = tpl.body_template;
  }

  // Sample data for rendering
  const sampleVars: Record<string, string> = {
    deal_name: "Test Deal — Acme Corp",
    from_stage: "Outreach",
    to_stage: "Video Call",
    board_type: "BD",
    changed_by: "Jon",
    stage: "Video Call",
    value: "50000",
    total_deals: "24",
    board_summary: "  BD: 15\n  Marketing: 7\n  Admin: 2",
    board_summary_html: "  BD: 15\n  Marketing: 7\n  Admin: 2",
    stage_summary: "  Potential Client: 5\n  Outreach: 8",
    stage_summary_html: "  Potential Client: 5\n  Outreach: 8",
    moves_today: "3",
    top_deals_section: "",
    top_deals_section_html: "",
    message: "This is a test broadcast message.",
    sender_name: "Jon",
    tag: "priority",
  };

  const rendered = renderTemplate(body, sampleVars);
  const testMessage = `🧪 <b>Template Test</b>\n\n${rendered}`;

  const result = await sendTelegramWithTracking({
    chatId: Number(chat_id),
    text: testMessage,
    notificationType: "template_test",
  });

  if (result.success) {
    return NextResponse.json({ ok: true, messageId: result.messageId });
  }
  return NextResponse.json({ error: result.error ?? "Failed to send" }, { status: 500 });
}
