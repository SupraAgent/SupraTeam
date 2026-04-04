import { NextResponse } from "next/server";
import { encryptToken } from "@/lib/crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { verifyCalendlyState } from "../connect/route";
import { createWebhookSubscription } from "@/lib/calendly/client";
import { serverCache } from "@/lib/email/server-cache";

/** GET: Calendly OAuth callback — exchange code for tokens, store encrypted */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not configured" }, { status: 503 });
  }

  const settingsUrl = "/settings/integrations/calendly";

  if (error) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=${encodeURIComponent(error)}`, baseUrl)
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=missing_params`, baseUrl)
    );
  }

  // Validate HMAC-signed state
  const stateData = verifyCalendlyState(stateParam);
  if (!stateData || stateData.type !== "calendly") {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=invalid_state`, baseUrl)
    );
  }

  const userId = stateData.uid as string;
  const ts = stateData.ts as number;
  const nonce = stateData.nonce as string;
  if (!userId || !ts || !nonce) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=invalid_state`, baseUrl)
    );
  }

  // Reject if state is older than 10 minutes
  if (Date.now() - ts > 10 * 60 * 1000) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=state_expired`, baseUrl)
    );
  }

  // Consume nonce to prevent replay
  const nonceKey = `calendly-oauth-nonce:${nonce}`;
  if (serverCache.get(nonceKey)) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=state_reused`, baseUrl)
    );
  }

  const nonceAdmin = createSupabaseAdmin();
  if (!nonceAdmin) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=server_error`, baseUrl)
    );
  }

  serverCache.set(nonceKey, true, 10 * 60 * 1000);

  const { error: nonceInsertError } = await nonceAdmin
    .from("crm_email_audit_log")
    .insert({
      user_id: userId,
      action: "calendly_oauth_nonce_consumed",
      metadata: { nonce },
    });

  if (nonceInsertError) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=state_reused`, baseUrl)
    );
  }

  // Verify the authenticated user matches the state
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=session_required`, baseUrl)
    );
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=not_authenticated`, baseUrl)
    );
  }
  if (user.id !== userId) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=user_mismatch`, baseUrl)
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=server_error`, baseUrl)
    );
  }

  try {
    // Exchange code for tokens
    const clientId = process.env.CALENDLY_CLIENT_ID!;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET!;

    const tokenRes = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/calendly/callback`,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[calendly/callback] Token exchange failed:", errText.slice(0, 200));
      return NextResponse.redirect(
        new URL(`${settingsUrl}?calendly_error=oauth_failed`, baseUrl)
      );
    }

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?calendly_error=no_tokens`, baseUrl)
      );
    }

    // Fetch user info from Calendly
    const userRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?calendly_error=user_fetch_failed`, baseUrl)
      );
    }

    const userData = await userRes.json();
    const calendlyUser = userData.resource;

    if (!calendlyUser?.uri || !calendlyUser?.email) {
      return NextResponse.redirect(
        new URL(`${settingsUrl}?calendly_error=invalid_user`, baseUrl)
      );
    }

    const expiresAt = new Date(
      Date.now() + (tokens.expires_in ?? 7200) * 1000
    ).toISOString();

    // Upsert connection
    const { data: connection } = await admin
      .from("crm_calendly_connections")
      .upsert(
        {
          user_id: userId,
          calendly_user_uri: calendlyUser.uri,
          calendly_email: calendlyUser.email,
          calendly_name: calendlyUser.name ?? null,
          access_token_encrypted: encryptToken(tokens.access_token),
          refresh_token_encrypted: encryptToken(tokens.refresh_token),
          token_expires_at: expiresAt,
          organization_uri: calendlyUser.current_organization ?? null,
          scheduling_url: calendlyUser.scheduling_url ?? null,
          is_active: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("id")
      .single();

    // Create webhook subscription (non-blocking)
    if (connection?.id && calendlyUser.current_organization) {
      try {
        const webhookUri = await createWebhookSubscription(
          userId,
          `${baseUrl}/api/webhooks/calendly`,
          calendlyUser.current_organization
        );
        await admin
          .from("crm_calendly_connections")
          .update({ webhook_subscription_uri: webhookUri })
          .eq("id", connection.id);
      } catch (err) {
        console.error("[calendly/callback] Webhook setup failed:", err instanceof Error ? err.message : "unknown");
        // Non-fatal: connection still works, webhooks can be set up later
      }
    }

    // Audit log
    await admin.from("crm_email_audit_log").insert({
      user_id: userId,
      action: "calendly_connected",
      metadata: { email: calendlyUser.email },
    });

    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_success=connected`, baseUrl)
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown";
    console.error("[calendly/callback] OAuth failed:", errMsg.slice(0, 200));
    return NextResponse.redirect(
      new URL(`${settingsUrl}?calendly_error=oauth_failed`, baseUrl)
    );
  }
}
