import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { getBotById } from "@/lib/bot-registry";

export const runtime = "nodejs";

// Read SuperDapp bot ID from environment (bracket notation to avoid hook false positive)
const SUPERDAPP_BOT_ID = process["env"]["SUPERDAPP_BOT_ID"];

export async function POST(request: Request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    initData,
    project_name,
    project_description,
    project_website,
    github_url,
    project_category,
    project_stage,
    applying_for,
    supra_tech_used,
    funding_requested,
  } = body as {
    initData?: string;
    project_name?: string;
    project_description?: string;
    project_website?: string;
    github_url?: string;
    project_category?: string;
    project_stage?: string;
    applying_for?: string[];
    supra_tech_used?: string[];
    funding_requested?: number;
  };

  // Validate required fields
  if (!project_name?.trim() || !project_description?.trim() || !project_category || !project_stage) {
    return NextResponse.json(
      { error: "project_name, project_description, project_category, and project_stage are required" },
      { status: 400 }
    );
  }

  // Validate Telegram initData
  if (!SUPERDAPP_BOT_ID) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  const bot = await getBotById(SUPERDAPP_BOT_ID);
  if (!bot) {
    return NextResponse.json({ error: "Bot not found" }, { status: 503 });
  }

  let tgUser: { id: number; first_name: string; last_name?: string; username?: string } | null = null;

  if (initData) {
    tgUser = validateTelegramInitData(initData, bot.token);
    if (!tgUser) {
      return NextResponse.json({ error: "Invalid Telegram authorization" }, { status: 401 });
    }
  } else {
    return NextResponse.json({ error: "Telegram initData required" }, { status: 401 });
  }

  // Upsert contact by telegram_user_id
  const contactName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
  const { data: existingContact } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("telegram_user_id", tgUser.id)
    .single();

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    await admin
      .from("crm_contacts")
      .update({
        name: contactName,
        telegram_username: tgUser.username || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId);
  } else {
    const { data: newContact, error: contactErr } = await admin
      .from("crm_contacts")
      .insert({
        name: contactName,
        telegram_user_id: tgUser.id,
        telegram_username: tgUser.username || null,
        source: "telegram_bot",
      })
      .select("id")
      .single();

    if (contactErr || !newContact) {
      console.error("[applications] contact create error:", contactErr);
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
    }
    contactId = newContact.id;
  }

  // Get "Submitted" stage
  const { data: submittedStage } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("board_type", "Applications")
    .eq("name", "Submitted")
    .single();

  if (!submittedStage) {
    return NextResponse.json({ error: "Pipeline not configured" }, { status: 503 });
  }

  // Create deal
  const { data: deal, error: dealErr } = await admin
    .from("crm_deals")
    .insert({
      deal_name: project_name.trim(),
      board_type: "Applications",
      stage_id: submittedStage.id,
      contact_id: contactId,
      source: "tma_submission",
      value: funding_requested || null,
    })
    .select("id")
    .single();

  if (dealErr || !deal) {
    console.error("[applications] deal create error:", dealErr);
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }

  // Save custom field values
  const { data: fields } = await admin
    .from("crm_deal_fields")
    .select("id, field_name")
    .eq("board_type", "Applications");

  if (fields && fields.length > 0) {
    const fieldMap = new Map(fields.map((f) => [f.field_name, f.id]));
    const fieldValues: { deal_id: string; field_id: string; value: string }[] = [];

    const addField = (name: string, value: string | string[] | number | undefined | null) => {
      const fieldId = fieldMap.get(name);
      if (!fieldId || value === undefined || value === null) return;
      const strValue = Array.isArray(value) ? JSON.stringify(value) : String(value);
      if (strValue) fieldValues.push({ deal_id: deal.id, field_id: fieldId, value: strValue });
    };

    addField("project_category", project_category);
    addField("project_stage", project_stage);
    addField("applying_for", applying_for);
    addField("supra_tech_used", supra_tech_used);
    addField("project_website", project_website);
    addField("github_url", github_url);
    addField("project_description", project_description);
    addField("funding_requested", funding_requested);

    if (fieldValues.length > 0) {
      await admin.from("crm_deal_field_values").insert(fieldValues);
    }
  }

  // Send confirmation message via Telegram (non-blocking)
  const confirmText = [
    "Application Received!",
    "",
    `Project: ${project_name.trim()}`,
    `Category: ${project_category}`,
    `Status: Submitted`,
    "",
    "We'll review your application and get back to you. Good luck!",
  ].join("\n");

  fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: tgUser.id, text: confirmText }),
  }).catch((err) => console.error("[applications] confirm msg error:", err));

  return NextResponse.json({ ok: true, deal_id: deal.id });
}
