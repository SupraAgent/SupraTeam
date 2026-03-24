import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/crypto";
import { verifySlackToken } from "@/lib/slack";

/** GET — Check if Slack is connected and return workspace info */
export async function GET() {
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ connected: false });

  const { data } = await admin
    .from("user_tokens")
    .select("encrypted_token, metadata")
    .eq("provider", "slack_bot")
    .limit(1)
    .single();

  if (!data?.encrypted_token) {
    return NextResponse.json({ connected: false });
  }

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    connected: true,
    team: meta.team ?? null,
    bot_user: meta.bot_user ?? null,
  });
}

/** POST — Save Slack Bot Token (verifies with Slack first) */
export async function POST(request: Request) {
  const supabase = (await createClient()) ?? createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { token } = await request.json();
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Verify with Slack
  const verification = await verifySlackToken(token);
  if (!verification.ok) {
    return NextResponse.json(
      { error: `Invalid Slack token: ${verification.error}` },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdmin()!;
  const encrypted = encryptToken(token);

  // Upsert — one Slack bot token per workspace
  const { data: existing } = await admin
    .from("user_tokens")
    .select("id")
    .eq("provider", "slack_bot")
    .limit(1)
    .single();

  if (existing) {
    await admin
      .from("user_tokens")
      .update({
        encrypted_token: encrypted,
        metadata: { team: verification.team, bot_user: verification.bot_user },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("user_tokens").insert({
      user_id: user.id,
      provider: "slack_bot",
      encrypted_token: encrypted,
      metadata: { team: verification.team, bot_user: verification.bot_user },
    });
  }

  return NextResponse.json({
    ok: true,
    team: verification.team,
    bot_user: verification.bot_user,
  });
}

/** DELETE — Disconnect Slack */
export async function DELETE() {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  await admin.from("user_tokens").delete().eq("provider", "slack_bot");
  return NextResponse.json({ ok: true });
}
