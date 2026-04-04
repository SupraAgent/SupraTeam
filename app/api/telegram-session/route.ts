/**
 * Thin encrypted session blob storage.
 *
 * This route NEVER decrypts session data. It stores/retrieves opaque blobs
 * that only the user's browser can decrypt (zero-knowledge).
 *
 * GET  → return encrypted blob + metadata for current user
 * POST → store encrypted blob + metadata
 * DELETE → clear session
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** CSRF protection: reject requests from foreign origins. */
function checkOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  // Browsers always send Origin on POST/DELETE. Allow same-origin and server-side calls (no origin).
  if (!origin) return null;
  try {
    const reqUrl = new URL(req.url);
    const originUrl = new URL(origin);
    if (originUrl.origin === reqUrl.origin) return null;
  } catch {
    // Malformed origin
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("tg_client_sessions")
    .select("session_encrypted, phone_last4, telegram_user_id, is_active, connected_at, encryption_method")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ connected: false });
  }

  // Only return client-encrypted sessions — legacy server sessions need re-auth
  if (data.encryption_method !== "client") {
    return NextResponse.json({
      connected: false,
      needsReauth: true,
      reason: "Session was encrypted server-side. Re-authenticate for zero-knowledge encryption.",
    });
  }

  return NextResponse.json({
    connected: data.is_active,
    sessionEncrypted: data.session_encrypted, // opaque blob — server can't decrypt
    phoneLast4: data.phone_last4,
    telegramUserId: data.telegram_user_id,
    connectedAt: data.connected_at,
  });
}

export async function POST(req: NextRequest) {
  const csrfError = checkOrigin(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { sessionEncrypted, phoneLast4, telegramUserId } = body;

  // ── Input validation ──────────────────────────────────────────
  if (!sessionEncrypted || !telegramUserId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate telegramUserId is a positive integer
  if (typeof telegramUserId !== "number" || !Number.isInteger(telegramUserId) || telegramUserId <= 0) {
    return NextResponse.json({ error: "Invalid telegramUserId" }, { status: 400 });
  }

  // Validate sessionEncrypted is a base64.base64 blob within size limits
  // Telegram sessions are typically ~500 bytes encrypted, cap at 8KB
  if (typeof sessionEncrypted !== "string" || sessionEncrypted.length > 8192) {
    return NextResponse.json({ error: "Invalid session blob" }, { status: 400 });
  }
  const SESSION_BLOB_RE = /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/;
  if (!SESSION_BLOB_RE.test(sessionEncrypted)) {
    return NextResponse.json({ error: "Invalid session blob format" }, { status: 400 });
  }

  // Validate phoneLast4 if present (exactly 4 digits)
  if (phoneLast4 !== undefined && phoneLast4 !== null) {
    if (typeof phoneLast4 !== "string" || !/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json({ error: "Invalid phoneLast4" }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("tg_client_sessions")
    .upsert(
      {
        user_id: user.id,
        session_encrypted: sessionEncrypted,
        phone_last4: phoneLast4 || null,
        telegram_user_id: telegramUserId,
        is_active: true,
        connected_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        encryption_method: "client",
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[telegram-session] Save error:", error);
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const csrfError = checkOrigin(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Null out all metadata — full purge on disconnect
  const { error } = await supabase
    .from("tg_client_sessions")
    .update({
      is_active: false,
      session_encrypted: null,
      phone_last4: null,
      telegram_user_id: null,
      phone_number_hash: null,
      encryption_method: "server", // Reset to default — no valid session
      last_used_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("[telegram-session] Delete error:", error);
    return NextResponse.json({ error: "Failed to clear session" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
