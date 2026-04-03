import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { verifySlackToken } from "@/lib/slack";
import { requireAuth, requireLeadRole } from "@/lib/auth-guard";

/** GET — Check if Slack is connected and return workspace info */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Check DB — scoped to current user's token
  const admin = createSupabaseAdmin();
  if (admin) {
    const { data } = await admin
      .from("user_tokens")
      .select("encrypted_token")
      .eq("provider", "slack")
      .eq("user_id", auth.user.id)
      .limit(1)
      .single();

    if (data?.encrypted_token) {
      // Verify token is still valid and get workspace info
      try {
        const token = decryptToken(data.encrypted_token);
        const verification = await verifySlackToken(token);
        if (verification.ok) {
          return NextResponse.json({
            connected: true,
            team: verification.team ?? null,
            bot_user: verification.bot_user ?? null,
          });
        }
      } catch {
        // Token exists but can't decrypt or verify — still show as connected
      }
      return NextResponse.json({
        connected: true,
        team: null,
        bot_user: null,
      });
    }
  }

  // Fallback: check env var
  if (process.env.SLACK_BOT_TOKEN) {
    return NextResponse.json({
      connected: true,
      team: "(env var)",
      bot_user: null,
    });
  }

  return NextResponse.json({ connected: false });
}

/** POST — Save Slack Bot Token (verifies with Slack first). Requires lead role. */
export async function POST(request: Request) {
  const leadAuth = await requireLeadRole();
  if ("error" in leadAuth) return leadAuth.error;
  const { user } = leadAuth;

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

  // Upsert — one Slack bot token per user
  const { data: existing } = await admin
    .from("user_tokens")
    .select("id")
    .eq("provider", "slack")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (existing) {
    await admin
      .from("user_tokens")
      .update({
        encrypted_token: encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("user_tokens").insert({
      user_id: user.id,
      provider: "slack",
      encrypted_token: encrypted,
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
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  await admin.from("user_tokens").delete().eq("provider", "slack").eq("user_id", auth.user.id);
  return NextResponse.json({ ok: true });
}
