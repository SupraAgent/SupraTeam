import { NextResponse } from "next/server";
import { encryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getOAuth2Client, verifyState } from "../../connections/gmail/route";
import { google } from "googleapis";
import { serverCache } from "@/lib/email/server-cache";

/** GET: Gmail OAuth callback — exchange code for tokens, store encrypted */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Always use configured app URL — never fall back to request.url (attacker-controlled Host header)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not configured" }, { status: 503 });
  }

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations/email?error=${encodeURIComponent(error)}`, baseUrl)
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=missing_params", baseUrl)
    );
  }

  // Validate HMAC-signed state
  const stateData = verifyState(stateParam);
  if (!stateData) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=invalid_state", baseUrl)
    );
  }

  const userId = stateData.uid as string;
  const ts = stateData.ts as number;
  if (!userId || !ts) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=invalid_state", baseUrl)
    );
  }

  // Reject if state is older than 10 minutes
  if (Date.now() - ts > 10 * 60 * 1000) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=state_expired", baseUrl)
    );
  }

  // Verify the authenticated user matches the state — session is REQUIRED
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=session_required", baseUrl)
    );
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=not_authenticated", baseUrl)
    );
  }
  if (user.id !== userId) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=user_mismatch", baseUrl)
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=server_error", baseUrl)
    );
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/settings/integrations/email?error=no_tokens", baseUrl)
      );
    }

    // Get user email from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return NextResponse.redirect(
        new URL("/settings/integrations/email?error=no_email", baseUrl)
      );
    }

    // Check if this exact email is already connected (reconnect vs first connect)
    const { data: existing } = await admin
      .from("crm_email_connections")
      .select("id, is_default")
      .eq("user_id", userId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    // Check if user has ANY connections (for setting default on first-ever connect)
    const { count: totalConnections } = await admin
      .from("crm_email_connections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const isFirstConnection = !totalConnections || totalConnections === 0;

    // Upsert the connection — preserve is_default on reconnect
    await admin.from("crm_email_connections").upsert(
      {
        user_id: userId,
        provider: "gmail",
        email,
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        token_expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        scopes: tokens.scope?.split(" ") ?? [],
        is_default: existing?.is_default ?? isFirstConnection,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,email" }
    );

    // Invalidate cached drivers so next request uses the new tokens
    serverCache.invalidatePrefix(`driver:${userId}`);
    serverCache.invalidatePrefix("threads:");

    // Audit log
    await admin.from("crm_email_audit_log").insert({
      user_id: userId,
      action: "gmail_connected",
      metadata: { email },
    });

    return NextResponse.redirect(
      new URL("/settings/integrations/email?success=connected", baseUrl)
    );
  } catch (err) {
    console.error("[email/callback/gmail] error:", err);
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=oauth_failed", baseUrl)
    );
  }
}
