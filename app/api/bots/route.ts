import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { requireLeadRole } from "@/lib/auth-guard";

export async function GET() {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });

  const { data: bots, error } = await admin
    .from("crm_bots")
    .select("id, label, bot_username, bot_first_name, bot_telegram_id, is_active, is_default, groups_count, last_verified_at, created_by, created_at, updated_at")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/bots] list error:", error);
    return NextResponse.json({ error: "Failed to fetch bots" }, { status: 500 });
  }

  return NextResponse.json({ data: bots ?? [], source: "supabase" });
}

export async function POST(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, label } = body;
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Verify token with Telegram API
  let botInfo;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`);
    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json({ error: "Invalid bot token — Telegram rejected it" }, { status: 400 });
    }
    botInfo = data.result;
  } catch {
    return NextResponse.json({ error: "Failed to verify token with Telegram" }, { status: 502 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });

  // Check if this bot is already registered
  const { data: existing } = await admin
    .from("crm_bots")
    .select("id")
    .eq("bot_telegram_id", botInfo.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: `@${botInfo.username} is already registered` }, { status: 409 });
  }

  // Store encrypted token in user_tokens
  const encrypted = encryptToken(token.trim());
  const provider = `telegram_bot_${botInfo.id}`;

  const { data: tokenRow, error: tokenError } = await admin
    .from("user_tokens")
    .upsert(
      { user_id: user.id, provider, encrypted_token: encrypted },
      { onConflict: "user_id,provider" }
    )
    .select("id")
    .single();

  if (tokenError) {
    console.error("[api/bots] token upsert error:", tokenError);
    return NextResponse.json({ error: "Failed to store token" }, { status: 500 });
  }

  // Check if there are any existing bots — if not, this one is default
  const { count } = await admin
    .from("crm_bots")
    .select("id", { count: "exact", head: true });

  const isFirst = (count ?? 0) === 0;

  const botLabel = typeof label === "string" && label.trim()
    ? label.trim()
    : `@${botInfo.username}`;

  const { data: bot, error: insertError } = await admin
    .from("crm_bots")
    .insert({
      label: botLabel,
      bot_username: botInfo.username,
      bot_first_name: botInfo.first_name,
      bot_telegram_id: botInfo.id,
      token_id: tokenRow.id,
      is_active: true,
      is_default: isFirst,
      last_verified_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[api/bots] insert error:", insertError);
    return NextResponse.json({ error: "Failed to register bot" }, { status: 500 });
  }

  return NextResponse.json({ data: bot, source: "supabase" }, { status: 201 });
}

/** PATCH /api/bots — re-verify a bot token (token rotation health check). Requires lead role. */
export async function PATCH(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { bot_id, new_token } = body;
  if (typeof bot_id !== "string") return NextResponse.json({ error: "bot_id required" }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });

  const { data: bot } = await admin.from("crm_bots").select("id, token_id, bot_telegram_id").eq("id", bot_id).single();
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

  // If new_token provided, validate and rotate
  if (typeof new_token === "string" && new_token.trim()) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${new_token.trim()}/getMe`);
      const data = await res.json();
      if (!data.ok) return NextResponse.json({ error: "Invalid new token" }, { status: 400 });
      if (data.result.id !== bot.bot_telegram_id) return NextResponse.json({ error: "New token belongs to a different bot" }, { status: 400 });

      // Update encrypted token
      const encrypted = encryptToken(new_token.trim());
      await admin.from("user_tokens").update({ encrypted_token: encrypted }).eq("id", bot.token_id);
      await admin.from("crm_bots").update({ last_verified_at: new Date().toISOString() }).eq("id", bot_id);
      return NextResponse.json({ data: { verified: true, rotated: true } });
    } catch {
      return NextResponse.json({ error: "Failed to verify new token" }, { status: 502 });
    }
  }

  // Otherwise just re-verify existing token
  const { data: tokenRow } = await admin.from("user_tokens").select("encrypted_token").eq("id", bot.token_id).single();
  if (!tokenRow) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  try {
    const token = decryptToken(tokenRow.encrypted_token);
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    const verified = data.ok;
    await admin.from("crm_bots").update({ last_verified_at: verified ? new Date().toISOString() : null, is_active: verified }).eq("id", bot_id);
    return NextResponse.json({ data: { verified } });
  } catch {
    await admin.from("crm_bots").update({ is_active: false }).eq("id", bot_id);
    return NextResponse.json({ data: { verified: false } });
  }
}
