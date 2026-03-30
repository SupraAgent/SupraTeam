import { NextResponse } from "next/server";
import { encryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getCalendarOAuth2Client, verifyCalendarState } from "../connect/route";
import { google } from "googleapis";
import { serverCache } from "@/lib/email/server-cache";
import { triggerSync } from "@/lib/calendar/sync";

/** GET: Google Calendar OAuth callback — exchange code for tokens, store encrypted */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not configured" }, { status: 503 });
  }

  const settingsUrl = "/settings/integrations";

  if (error) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=${encodeURIComponent(error)}`, baseUrl)
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=missing_params`, baseUrl)
    );
  }

  // Validate HMAC-signed state
  const stateData = verifyCalendarState(stateParam);
  if (!stateData || stateData.type !== "calendar") {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=invalid_state`, baseUrl)
    );
  }

  const userId = stateData.uid as string;
  const ts = stateData.ts as number;
  const nonce = stateData.nonce as string;
  if (!userId || !ts || !nonce) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=invalid_state`, baseUrl)
    );
  }

  // Reject if state is older than 10 minutes
  if (Date.now() - ts > 10 * 60 * 1000) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=state_expired`, baseUrl)
    );
  }

  // Consume nonce to prevent state replay
  const nonceKey = `cal-oauth-nonce:${nonce}`;
  if (serverCache.get(nonceKey)) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=state_reused`, baseUrl)
    );
  }

  const nonceAdmin = createSupabaseAdmin();
  if (!nonceAdmin) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=server_error`, baseUrl)
    );
  }

  // Atomically consume nonce using unique index to prevent TOCTOU race
  // The unique index idx_audit_log_cal_oauth_nonce ensures only one row per nonce
  serverCache.set(nonceKey, true, 10 * 60 * 1000);

  const { error: nonceInsertError } = await nonceAdmin
    .from("crm_email_audit_log")
    .insert({
      user_id: userId,
      action: "cal_oauth_nonce_consumed",
      metadata: { nonce },
    });

  // If insert failed due to unique constraint violation, nonce was already consumed
  if (nonceInsertError) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=state_reused`, baseUrl)
    );
  }

  // Verify the authenticated user matches the state
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=session_required`, baseUrl)
    );
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=not_authenticated`, baseUrl)
    );
  }
  if (user.id !== userId) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=user_mismatch`, baseUrl)
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=server_error`, baseUrl)
    );
  }

  try {
    const oauth2Client = getCalendarOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?cal_error=no_tokens`, baseUrl)
      );
    }

    // Validate granted scopes — at least one calendar scope must be present
    const grantedScopes = tokens.scope?.split(" ") ?? [];
    const hasCalendarScope = grantedScopes.some(
      (s) =>
        s === "https://www.googleapis.com/auth/calendar.events" ||
        s === "https://www.googleapis.com/auth/calendar.readonly"
    );
    if (!hasCalendarScope) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?cal_error=missing_scopes`, baseUrl)
      );
    }

    // Get user email from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?cal_error=no_email`, baseUrl)
      );
    }

    // Check if this email already connected
    const { data: existing } = await admin
      .from("crm_calendar_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("google_email", email)
      .limit(1)
      .maybeSingle();

    const upsertData: Record<string, unknown> = {
      user_id: userId,
      google_email: email,
      access_token_encrypted: encryptToken(tokens.access_token),
      token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      scopes: tokens.scope?.split(" ") ?? [],
      is_active: true,
      connected_at: new Date().toISOString(),
    };

    if (tokens.refresh_token) {
      upsertData.refresh_token_encrypted = encryptToken(tokens.refresh_token);
    } else if (!existing) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?cal_error=no_refresh_token`, baseUrl)
      );
    }

    const { data: connection } = await admin
      .from("crm_calendar_connections")
      .upsert(upsertData, { onConflict: "user_id,google_email" })
      .select("id")
      .single();

    // Trigger initial sync for primary calendar (non-blocking)
    if (connection?.id) {
      triggerSync(userId, connection.id, "primary").catch((err) => {
        console.error("[calendar/callback] Initial sync failed:", err instanceof Error ? err.message : "unknown");
      });
    }

    // Audit log
    await admin.from("crm_email_audit_log").insert({
      user_id: userId,
      action: "calendar_connected",
      metadata: { email },
    });

    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_success=connected`, baseUrl)
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown";
    console.error("[calendar/callback] OAuth token exchange failed:", errMsg.slice(0, 200));
    return NextResponse.redirect(
      new URL(`${settingsUrl}?cal_error=oauth_failed`, baseUrl)
    );
  }
}
