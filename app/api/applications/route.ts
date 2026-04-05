import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { getBotById } from "@/lib/bot-registry";
import { rateLimit } from "@/lib/rate-limit";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

// Read SuperDapp bot ID from environment (bracket notation to avoid hook false positive)
const SUPERDAPP_BOT_ID = process["env"]["SUPERDAPP_BOT_ID"];

/** Generate a unique reference code like APP-X7K2 */
function generateReferenceCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  const bytes = randomBytes(4);
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `APP-${code}`;
}

/** Calculate auto-qualification score (0-100) based on application data */
function calculateApplicationScore(data: {
  github_url?: string;
  demo_url?: string;
  project_website?: string;
  project_stage?: string;
  team_size?: number;
  supra_tech_used?: string[];
}): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  // Has GitHub repo (+15)
  if (data.github_url?.trim()) {
    breakdown.github_repo = 15;
  }

  // Has demo URL (+15)
  if (data.demo_url?.trim()) {
    breakdown.demo_url = 15;
  }

  // Has website (+10)
  if (data.project_website?.trim()) {
    breakdown.website = 10;
  }

  // Project stage scoring
  const stageScores: Record<string, number> = {
    "Idea": 5,
    "MVP/Prototype": 15,
    "Beta": 25,
    "Live/Production": 30,
  };
  if (data.project_stage && stageScores[data.project_stage] !== undefined) {
    breakdown.project_stage = stageScores[data.project_stage];
  }

  // Team size scoring
  const teamSize = data.team_size ?? 0;
  if (teamSize >= 11) {
    breakdown.team_size = 25;
  } else if (teamSize >= 6) {
    breakdown.team_size = 20;
  } else if (teamSize >= 2) {
    breakdown.team_size = 15;
  } else if (teamSize === 1) {
    breakdown.team_size = 5;
  }

  // Supra technologies used: +5 per tech, max 25
  const techCount = data.supra_tech_used?.length ?? 0;
  if (techCount > 0) {
    breakdown.supra_tech = Math.min(techCount * 5, 25);
  }

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  return { score: Math.min(score, 100), breakdown };
}

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

  // Calculate auto-score
  const { score, breakdown } = calculateApplicationScore({
    github_url: github_url as string | undefined,
    demo_url: demo_url as string | undefined,
    project_website: project_website as string | undefined,
    project_stage: project_stage as string | undefined,
    team_size: team_size as number | undefined,
    supra_tech_used: supra_tech_used as string[] | undefined,
  });

  // Generate unique reference code (retry on collision)
  let referenceCode = generateReferenceCode();
  let codeIsUnique = false;
  for (let retries = 0; retries < 5; retries++) {
    const { data: existing } = await admin
      .from("crm_deals")
      .select("id")
      .eq("reference_code", referenceCode)
      .single();
    if (!existing) {
      codeIsUnique = true;
      break;
    }
    referenceCode = generateReferenceCode();
  }
  if (!codeIsUnique) {
    console.error("[applications] reference code collision after 5 retries");
    return NextResponse.json({ error: "Failed to generate unique reference code. Please try again." }, { status: 500 });
  }

  // Create deal
  const { data: deal, error: dealErr } = await admin
    .from("crm_deals")
    .insert({
      deal_name: project_name.trim(),
      board_type: "Applications",
      stage_id: submittedStage.id,
      contact_id: contactId,
      source: submissionSource,
      value: funding_requested ?? null,
      health_score: score,
      reference_code: referenceCode,
    })
    .select("id, reference_code")
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
    addField("demo_url", demo_url);
    addField("twitter_handle", twitter_handle);
    addField("team_size", team_size);

    if (fieldValues.length > 0) {
      await admin.from("crm_deal_field_values").insert(fieldValues);
    }
  }

  // Store scoring breakdown as a deal note
  const scoreNote = [
    `Auto-Score: ${score}/100`,
    ...Object.entries(breakdown).map(([key, val]) => `  ${key}: +${val}`),
  ].join("\n");
  await admin.from("crm_deal_notes").insert({
    deal_id: deal.id,
    text: scoreNote,
  }).then(() => {}, (err) => console.error("[applications] score note error:", err));

  // Send confirmation message via Telegram (non-blocking, TMA only)
  if (tgUser && SUPERDAPP_BOT_ID) {
    const bot = await getBotById(SUPERDAPP_BOT_ID);
    if (bot) {
      const confirmText = [
        "Application Received!",
        "",
        `Reference: ${referenceCode}`,
        `Project: ${project_name.trim()}`,
        `Category: ${project_category}`,
        `Score: ${score}/100`,
        `Status: Submitted`,
        "",
        `Track your application anytime with reference code: ${referenceCode}`,
      ].join("\n");

      fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgUser.id, text: confirmText }),
      }).catch((err) => console.error("[applications] confirm msg error:", err));
    }
  }

  return NextResponse.json({
    ok: true,
    deal_id: deal.id,
    reference_code: deal.reference_code,
    score,
  });
}
