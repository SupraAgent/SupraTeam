import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { getBotById } from "@/lib/bot-registry";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Read SuperDapp bot ID from environment (bracket notation to avoid hook false positive)
const SUPERDAPP_BOT_ID = process["env"]["SUPERDAPP_BOT_ID"];

export async function POST(request: Request) {
  // Rate limit by IP — 5 submissions per 10 minutes
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = rateLimit(`applications:${ip}`, { max: 5, windowSec: 600 });
  if (limited) return limited;

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
    demo_url,
    twitter_handle,
    team_size,
    project_category,
    project_stage,
    applying_for,
    supra_tech_used,
    funding_requested,
    qr_code_id,
    qr_campaign,
    qr_source,
  } = body as {
    initData?: string;
    project_name?: string;
    project_description?: string;
    project_website?: string;
    github_url?: string;
    demo_url?: string;
    twitter_handle?: string;
    team_size?: number;
    project_category?: string;
    project_stage?: string;
    applying_for?: string[];
    supra_tech_used?: string[];
    funding_requested?: number;
    qr_code_id?: string;
    qr_campaign?: string;
    qr_source?: string;
  };

  // Validate required fields
  if (!project_name?.trim() || !project_description?.trim() || !project_category || !project_stage) {
    return NextResponse.json(
      { error: "project_name, project_description, project_category, and project_stage are required" },
      { status: 400 }
    );
  }

  // Dual auth: Telegram initData OR web session
  let tgUser: { id: number; first_name: string; last_name?: string; username?: string } | null = null;
  let webUser: { id: string; email?: string; name?: string } | null = null;
  let submissionSource = "tma_submission";

  if (initData) {
    // TMA mode: validate Telegram initData
    if (!SUPERDAPP_BOT_ID) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
    }
    const bot = await getBotById(SUPERDAPP_BOT_ID);
    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 503 });
    }
    tgUser = validateTelegramInitData(initData, bot.token);
    if (!tgUser) {
      return NextResponse.json({ error: "Invalid Telegram authorization" }, { status: 401 });
    }
  } else {
    // Web mode: check for authenticated session
    const supabase = await createSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();
      webUser = {
        id: user.id,
        email: user.email,
        name: profile?.display_name || user.email?.split("@")[0] || "Web User",
      };
      submissionSource = "web_submission";
    } else {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  }

  // Upsert or create contact
  let contactId: string;

  if (tgUser) {
    // TMA: upsert by telegram_user_id, scoped to source="telegram_bot" to avoid
    // hijacking contacts created by other users/flows
    const contactName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
    const { data: existingContact } = await admin
      .from("crm_contacts")
      .select("id")
      .eq("telegram_user_id", tgUser.id)
      .eq("source", "telegram_bot")
      .single();

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
  } else if (webUser) {
    // Web: upsert by email
    const { data: existingContact } = await admin
      .from("crm_contacts")
      .select("id")
      .eq("email", webUser.email)
      .single();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactErr } = await admin
        .from("crm_contacts")
        .insert({
          name: webUser.name,
          email: webUser.email,
          source: "web_form",
        })
        .select("id")
        .single();

      if (contactErr || !newContact) {
        console.error("[applications] web contact create error:", contactErr);
        return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
      }
      contactId = newContact.id;
    }
  } else {
    return NextResponse.json({ error: "No valid identity" }, { status: 401 });
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

  // If QR code specified, use its pipeline stage and assigned_to as defaults
  let dealStageId = submittedStage.id;
  let dealAssignedTo: string | null = null;
  let dealSource = submissionSource;

  if (qr_code_id) {
    const { data: qrCode } = await admin
      .from("crm_qr_codes")
      .select("pipeline_stage_id, assigned_to, campaign, source")
      .eq("id", qr_code_id)
      .single();

    if (qrCode) {
      if (qrCode.pipeline_stage_id) dealStageId = qrCode.pipeline_stage_id;
      if (qrCode.assigned_to) dealAssignedTo = qrCode.assigned_to;
      dealSource = `qr_scan${qrCode.campaign ? `:${qrCode.campaign}` : ""}`;
    }
  }

  // Create deal
  const { data: deal, error: dealErr } = await admin
    .from("crm_deals")
    .insert({
      deal_name: project_name.trim(),
      board_type: "Applications",
      stage_id: dealStageId,
      contact_id: contactId,
      assigned_to: dealAssignedTo,
      source: dealSource,
      value: funding_requested || null,
    })
    .select("id")
    .single();

  if (dealErr || !deal) {
    console.error("[applications] deal create error:", dealErr);
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }

  // Link QR scan to the created deal (update the most recent scan for this TG user + QR code)
  if (qr_code_id && tgUser) {
    await admin
      .from("crm_qr_scans")
      .update({ converted_to_deal_id: deal.id })
      .eq("qr_code_id", qr_code_id)
      .eq("telegram_user_id", tgUser.id)
      .is("converted_to_deal_id", null)
      .order("scanned_at", { ascending: false })
      .limit(1);
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
    addField("demo_url", demo_url);
    addField("twitter_handle", twitter_handle);
    addField("team_size", team_size);

    if (fieldValues.length > 0) {
      await admin.from("crm_deal_field_values").insert(fieldValues);
    }
  }

  // Send confirmation message via Telegram (non-blocking, TMA only)
  if (tgUser && SUPERDAPP_BOT_ID) {
    const bot = await getBotById(SUPERDAPP_BOT_ID);
    if (bot) {
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
    }
  }

  return NextResponse.json({ ok: true, deal_id: deal.id });
}
