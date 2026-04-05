import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getCurrentKeyVersion } from "@/lib/crypto";

/**
 * GET /api/messages/index/config — Get user's indexing configuration.
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { data: config } = await supabase
    .from("crm_message_index_config")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Also get indexed message count for status display
  let messageCount = 0;
  if (config?.indexing_enabled) {
    const { count } = await supabase
      .from("crm_message_index")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    messageCount = count ?? 0;
  }

  return NextResponse.json({
    data: config ?? {
      user_id: user.id,
      indexing_enabled: false,
      consent_given_at: null,
      indexed_chats: [],
      exclude_chats: [],
      retention_days: 90,
      last_full_sync_at: null,
      encryption_key_id: null,
    },
    message_count: messageCount,
    source: "supabase",
  });
}

/**
 * POST /api/messages/index/config — Enable indexing (requires explicit consent).
 *
 * Body: { consent: true, retention_days?: number }
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.consent !== true) {
    return NextResponse.json(
      { error: "Explicit consent is required to enable message indexing. Pass { consent: true }." },
      { status: 400 }
    );
  }

  const retentionDays = typeof body.retention_days === "number"
    ? Math.max(1, Math.min(730, body.retention_days))
    : 90;

  const { data: config, error } = await supabase
    .from("crm_message_index_config")
    .upsert({
      user_id: user.id,
      indexing_enabled: true,
      consent_given_at: new Date().toISOString(),
      retention_days: retentionDays,
      encryption_key_id: `v${getCurrentKeyVersion()}`,
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    console.error("[api/messages/index/config] enable error:", error);
    return NextResponse.json({ error: "Failed to enable indexing" }, { status: 500 });
  }

  return NextResponse.json({ data: config, source: "supabase" });
}

/**
 * PUT /api/messages/index/config — Update indexing configuration.
 *
 * Body: { indexed_chats?: number[], exclude_chats?: number[], retention_days?: number }
 */
export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only allow updating specific fields
  const updates: Record<string, unknown> = {};

  if (Array.isArray(body.indexed_chats)) {
    updates.indexed_chats = body.indexed_chats;
  }

  if (Array.isArray(body.exclude_chats)) {
    updates.exclude_chats = body.exclude_chats;
  }

  if (typeof body.retention_days === "number") {
    updates.retention_days = Math.max(1, Math.min(730, body.retention_days));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: config, error } = await supabase
    .from("crm_message_index_config")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[api/messages/index/config] update error:", error);
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }

  return NextResponse.json({ data: config, source: "supabase" });
}

/**
 * DELETE /api/messages/index/config — Disable indexing and delete ALL indexed data.
 *
 * This is a hard delete — all indexed messages are permanently removed.
 */
export async function DELETE() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  // Delete all indexed messages first
  const { error: deleteError } = await supabase
    .from("crm_message_index")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("[api/messages/index/config] delete messages error:", deleteError);
    return NextResponse.json({ error: "Failed to delete indexed messages" }, { status: 500 });
  }

  // Disable indexing
  const { error: configError } = await supabase
    .from("crm_message_index_config")
    .update({
      indexing_enabled: false,
      indexed_chats: [],
      exclude_chats: [],
      last_full_sync_at: null,
    })
    .eq("user_id", user.id);

  if (configError) {
    console.error("[api/messages/index/config] disable error:", configError);
    return NextResponse.json({ error: "Failed to disable indexing" }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true }, source: "supabase" });
}
