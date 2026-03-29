import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import { encryptToken } from "@/lib/crypto";
import { ImapDriver } from "@/lib/email/imap-driver";
import { serverCache } from "@/lib/email/server-cache";

/**
 * POST: Connect a personal Gmail account using an App Password.
 * This bypasses the Gmail API entirely — uses IMAP/SMTP instead.
 *
 * Body: { email: string, appPassword: string }
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`gmail-personal:${auth.user.id}`, { max: 5, windowSec: 60 });
  if (rl) return rl;

  let body: { email?: string; appPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const appPassword = body.appPassword?.trim();

  if (!email || !appPassword) {
    return NextResponse.json(
      { error: "Email and app password are required" },
      { status: 400 }
    );
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // App passwords are 16 chars (4 groups of 4), but users may paste with spaces
  const cleanPassword = appPassword.replace(/\s/g, "");
  if (cleanPassword.length < 12 || cleanPassword.length > 32) {
    return NextResponse.json(
      { error: "Invalid app password format. Google App Passwords are typically 16 characters." },
      { status: 400 }
    );
  }

  // Verify the credentials actually work by attempting an IMAP connection
  try {
    const driver = new ImapDriver({ email, appPassword: cleanPassword });
    const profile = await driver.getProfile();
    if (!profile.email) {
      return NextResponse.json({ error: "Could not verify email" }, { status: 400 });
    }

    // Try listing threads to verify IMAP access (catches auth failures)
    await driver.listThreads({ maxResults: 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("Invalid credentials") || msg.includes("AUTHENTICATIONFAILED")) {
      return NextResponse.json(
        { error: "Authentication failed. Please check your email and app password. Make sure you're using a Google App Password, not your regular password." },
        { status: 401 }
      );
    }
    if (msg.includes("IMAP") || msg.includes("connect")) {
      return NextResponse.json(
        { error: "Could not connect to Gmail IMAP. Please ensure IMAP is enabled in your Gmail settings." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to verify credentials. Please check your email and app password." },
      { status: 400 }
    );
  }

  // Store the connection
  const { admin } = auth;

  // Check for existing connection with same email
  const { data: existing } = await admin
    .from("crm_email_connections")
    .select("id, is_default")
    .eq("user_id", auth.user.id)
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  // Check if user has ANY connections
  const { count: totalConnections } = await admin
    .from("crm_email_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);

  const isFirstConnection = !totalConnections || totalConnections === 0;

  const upsertData: Record<string, unknown> = {
    user_id: auth.user.id,
    provider: "gmail_app_password",
    email,
    // Store app password in access_token_encrypted (it doesn't expire)
    access_token_encrypted: encryptToken(cleanPassword),
    refresh_token_encrypted: null,
    token_expires_at: null,
    scopes: ["imap", "smtp"],
    is_default: existing?.is_default ?? isFirstConnection,
    connected_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await admin.from("crm_email_connections").upsert(
    upsertData,
    { onConflict: "user_id,email" }
  );

  if (upsertErr) {
    console.error("[email/gmail-personal] Upsert failed:", upsertErr.message);
    return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
  }

  // Invalidate caches
  serverCache.invalidatePrefix(`driver:${auth.user.id}:`);
  serverCache.invalidatePrefix(`threads:${auth.user.id}:`);

  // Audit log
  await admin.from("crm_email_audit_log").insert({
    user_id: auth.user.id,
    action: "gmail_personal_connected",
    metadata: { email },
  });

  return NextResponse.json({ data: { email, provider: "gmail_app_password" }, source: "db" });
}
