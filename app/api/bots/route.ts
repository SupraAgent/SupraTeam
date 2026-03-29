import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, decryptToken } from "@/lib/crypto";

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
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
