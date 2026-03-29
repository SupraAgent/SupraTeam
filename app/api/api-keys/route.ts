/**
 * GET    /api/api-keys — List API keys (masked)
 * POST   /api/api-keys — Generate a new API key
 * DELETE /api/api-keys — Revoke an API key
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createHash, randomBytes } from "crypto";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: keys } = await supabase
    .from("crm_api_keys")
    .select("id, name, key_prefix, scopes, is_active, last_used_at, request_count, created_at, expires_at")
    .order("created_at", { ascending: false });

  return NextResponse.json({ keys: keys ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { name, scopes, expires_days } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const validScopes = ["read", "write", "admin"];
  const keyScopes = Array.isArray(scopes)
    ? scopes.filter((s: string) => validScopes.includes(s))
    : ["read"];

  // Generate a secure API key: sk_live_<32 random bytes hex>
  const rawKey = `sk_live_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);

  const expiresAt = expires_days
    ? new Date(Date.now() + expires_days * 86400000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("crm_api_keys")
    .insert({
      name: name.trim(),
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: keyScopes,
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select("id, name, key_prefix, scopes, created_at, expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return the raw key ONLY on creation (never stored in plain text)
  return NextResponse.json({ key: data, raw_key: rawKey, ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_api_keys")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
