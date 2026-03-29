import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { decryptToken } from "@/lib/crypto";
import { serverCache } from "@/lib/email/server-cache";

/** GET: List user's connected email accounts */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.admin
    .from("crm_email_connections")
    .select("id, provider, email, is_default, connected_at, last_sync_at")
    .eq("user_id", auth.user.id)
    .order("connected_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "supabase" });
}

/** DELETE: Disconnect an email account — revokes Google token then deletes */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Fetch the connection to get the token for revocation
  const { data: conn } = await auth.admin
    .from("crm_email_connections")
    .select("access_token_encrypted, refresh_token_encrypted")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();

  // Revoke Google OAuth tokens before deleting — revoking the refresh token
  // also invalidates all associated access tokens
  if (conn?.refresh_token_encrypted) {
    try {
      const token = decryptToken(conn.refresh_token_encrypted);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch {
      // Non-fatal — still delete the connection
    }
  } else if (conn?.access_token_encrypted) {
    try {
      const token = decryptToken(conn.access_token_encrypted);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch {
      // Non-fatal — still delete the connection
    }
  }

  const { error } = await auth.admin
    .from("crm_email_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }

  // Invalidate cached drivers for this user
  serverCache.invalidatePrefix(`driver:${auth.user.id}:`);

  return NextResponse.json({ ok: true, source: "supabase" });
}

/** PATCH: Set default connection */
export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Atomic: clear all defaults then set the new one in sequence
  // (Supabase doesn't support multi-statement transactions from JS client,
  // but clearing first then setting avoids the dual-default race)
  const { error: clearErr } = await auth.admin
    .from("crm_email_connections")
    .update({ is_default: false })
    .eq("user_id", auth.user.id);

  if (clearErr) {
    return NextResponse.json({ error: "Failed to set default" }, { status: 500 });
  }

  const { error } = await auth.admin
    .from("crm_email_connections")
    .update({ is_default: true })
    .eq("id", body.id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to set default" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
