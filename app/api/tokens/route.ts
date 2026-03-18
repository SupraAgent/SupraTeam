import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, decryptToken } from "@/lib/crypto";

export async function GET(request: Request) {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  const admin = createSupabaseAdmin()!;

  let query = admin
    .from("user_tokens")
    .select("id, provider, created_at, updated_at, encrypted_token")
    .eq("user_id", user.id);

  if (provider) {
    query = query.eq("provider", provider);
  }

  const { data: tokens, error } = await query;

  if (error) {
    console.error("[api/tokens] error:", error);
    return NextResponse.json({ error: "Failed to fetch tokens" }, { status: 500 });
  }

  // Return masked tokens (never expose full token)
  const masked = (tokens ?? []).map((t) => {
    let maskedValue = "••••";
    try {
      const decrypted = decryptToken(t.encrypted_token);
      maskedValue = "••••" + decrypted.slice(-4);
    } catch {
      // Can't decrypt, just show dots
    }
    return {
      id: t.id,
      provider: t.provider,
      masked: maskedValue,
      created_at: t.created_at,
      updated_at: t.updated_at,
    };
  });

  // If single provider requested, return first match
  if (provider) {
    return NextResponse.json({
      data: masked[0] ?? null,
      source: "supabase",
    });
  }

  return NextResponse.json({ data: masked, source: "supabase" });
}

export async function POST(request: Request) {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { provider, token } = body;

  if (typeof provider !== "string" || !provider.trim()) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const encrypted = encryptToken(token.trim());
  const admin = createSupabaseAdmin()!;

  // Upsert: one token per user per provider
  const { error } = await admin
    .from("user_tokens")
    .upsert(
      {
        user_id: user.id,
        provider: provider.trim(),
        encrypted_token: encrypted,
      },
      { onConflict: "user_id,provider" }
    );

  if (error) {
    console.error("[api/tokens] upsert error:", error);
    return NextResponse.json({ error: "Failed to save token" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
