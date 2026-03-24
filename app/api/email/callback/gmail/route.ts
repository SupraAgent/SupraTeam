import { NextResponse } from "next/server";
import { google } from "googleapis";
import { encryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

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
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations/email?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=missing_params", request.url)
    );
  }

  // Validate state -- must be a signed JSON payload with uid and timestamp
  let userId: string;
  try {
    const stateJson = JSON.parse(Buffer.from(stateParam, "base64url").toString());
    userId = stateJson.uid;
    const ts = stateJson.ts;
    if (!userId || !ts) throw new Error("Invalid state");
    // Reject if state is older than 10 minutes
    if (Date.now() - ts > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL("/settings/integrations/email?error=state_expired", request.url)
      );
    }
  } catch {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=invalid_state", request.url)
    );
  }

  // Verify the authenticated user matches the state
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.id !== userId) {
      return NextResponse.redirect(
        new URL("/settings/integrations/email?error=user_mismatch", request.url)
      );
    }
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=server_error", request.url)
    );
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/settings/integrations/email?error=no_tokens", request.url)
      );
    }

    // Get user email from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return NextResponse.redirect(
        new URL("/settings/integrations/email?error=no_email", request.url)
      );
    }

    // Check if this user already has connections
    const { data: existing } = await admin
      .from("crm_email_connections")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    const isFirstConnection = !existing || existing.length === 0;

    // Upsert the connection
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
        is_default: isFirstConnection,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,email" }
    );

    // Audit log
    await admin.from("crm_email_audit_log").insert({
      user_id: userId,
      action: "gmail_connected",
      metadata: { email },
    });

    return NextResponse.redirect(
      new URL("/settings/integrations/email?success=connected", request.url)
    );
  } catch (err) {
    console.error("[email/callback/gmail] error:", err);
    return NextResponse.redirect(
      new URL("/settings/integrations/email?error=oauth_failed", request.url)
    );
  }
}
