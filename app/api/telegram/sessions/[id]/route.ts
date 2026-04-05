import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * PATCH /api/telegram/sessions/[id]
 * Update display_name or is_active for a session.
 * Only the session owner can update (enforced by RLS).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.display_name === "string") {
    updates.display_name = body.display_name.trim() || null;
  }
  if (typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update. Provide display_name or is_active." },
      { status: 400 }
    );
  }

  // RLS policy "Users update own TG sessions" ensures only the owner can update
  const { data, error } = await supabase
    .from("tg_client_sessions")
    .update(updates)
    .eq("id", id)
    .select("id, user_id, display_name, is_active, phone_last4, telegram_user_id, connected_at, last_used_at")
    .single();

  if (error) {
    // If no rows matched, it's either not found or not owned by this user
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Session not found or you do not have permission to update it" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data, ok: true });
}

/**
 * DELETE /api/telegram/sessions/[id]
 * Disconnect and delete a session.
 * Only the session owner can delete (enforced by RLS).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  // RLS policy "Users delete own TG sessions" ensures only the owner can delete
  const { error } = await supabase
    .from("tg_client_sessions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
