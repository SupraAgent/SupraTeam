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
  const nonce = stateData.nonce as string;
  if (!userId || !ts || !nonce) {
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

  // Consume nonce to prevent state replay attacks (stored in DB for multi-instance safety)
  const { data: existingNonce } = await (() => {
    const adminClient = createSupabaseAdmin();
    if (!adminClient) return Promise.resolve({ data: null });
    return adminClient
      .from("crm_email_audit_log")
      .select("id")
      .eq("action", "oauth_nonce_consumed")
      .eq("metadata->>nonce", nonce)
      .limit(1)
      .maybeSingle();
  })();

  if (existingNonce) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=state_reused", baseUrl)
    );
  }

  // Also check in-memory for same-instance fast path
  const nonceKey = `oauth-nonce:${nonce}`;
  if (serverCache.get(nonceKey)) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=state_reused", baseUrl)
    );
  }
  serverCache.set(nonceKey, true, 10 * 60 * 1000);

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

    if (!tokens.access_token) {
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
    // On reconnect, Google may not return a new refresh_token (only on first consent).
    // Keep the existing refresh_token if Google didn't send a new one.
    const upsertData: Record<string, unknown> = {
      user_id: userId,
      provider: "gmail",
      email,
      access_token_encrypted: encryptToken(tokens.access_token),
      token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      scopes: tokens.scope?.split(" ") ?? [],
      is_default: existing?.is_default ?? isFirstConnection,
      connected_at: new Date().toISOString(),
    };

    // Only overwrite refresh_token if Google actually sent a new one
    if (tokens.refresh_token) {
      upsertData.refresh_token_encrypted = encryptToken(tokens.refresh_token);
    } else if (!existing) {
      // First-time connection MUST have a refresh token
      return NextResponse.redirect(
        new URL("/settings/integrations/email?error=no_refresh_token", baseUrl)
      );
    }

    await admin.from("crm_email_connections").upsert(
      upsertData,
      { onConflict: "user_id,email" }
    );

    // Invalidate cached drivers so next request uses the new tokens
    serverCache.invalidatePrefix(`driver:${userId}:`);
    serverCache.invalidatePrefix(`threads:${userId}:`);

    // Record nonce consumption (for multi-instance replay protection)
    await admin.from("crm_email_audit_log").insert({
      user_id: userId,
      action: "oauth_nonce_consumed",
      metadata: { nonce },
    });

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
    // Log sanitized error only — raw Google errors may contain tokens
    const errMsg = err instanceof Error ? err.message : "unknown";
    console.error("[email/callback/gmail] OAuth token exchange failed:", errMsg.slice(0, 200));
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=oauth_failed", baseUrl)
    );
  }
}
