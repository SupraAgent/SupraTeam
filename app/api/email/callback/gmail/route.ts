import { NextResponse } from "next/server";
import { google } from "googleapis";
import { encryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002"}/api/email/callback/gmail`
  );
}

/** GET: Gmail OAuth callback — exchange code for tokens, store encrypted */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // user_id
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/email?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings/email?error=missing_params", request.url)
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.redirect(
      new URL("/settings/email?error=server_error", request.url)
    );
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/settings/email?error=no_tokens", request.url)
      );
    }

    // Get user email from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return NextResponse.redirect(
        new URL("/settings/email?error=no_email", request.url)
      );
    }

    // Check if this user already has connections
    const { data: existing } = await admin
      .from("crm_email_connections")
      .select("id")
      .eq("user_id", state)
      .limit(1);

    const isFirstConnection = !existing || existing.length === 0;

    // Upsert the connection
    await admin.from("crm_email_connections").upsert(
      {
        user_id: state,
        provider: "gmail",
        email,
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        token_expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        scopes: tokens.scope?.split(" ") ?? [],
        is_default: isFirstConnection,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,email" }
    );

    // Audit log
    await admin.from("crm_email_audit_log").insert({
      user_id: state,
      action: "gmail_connected",
      metadata: { email },
    });

    return NextResponse.redirect(
      new URL("/settings/email?success=connected", request.url)
    );
  } catch (err) {
    console.error("[email/callback/gmail] error:", err);
    return NextResponse.redirect(
      new URL("/settings/email?error=oauth_failed", request.url)
    );
  }
}
