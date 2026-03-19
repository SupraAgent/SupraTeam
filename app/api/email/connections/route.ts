import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase";

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

/** DELETE: Disconnect an email account */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("crm_email_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }

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

  // Remove default from all (check for errors)
  const { error: clearErr } = await auth.admin
    .from("crm_email_connections")
    .update({ is_default: false })
    .eq("user_id", auth.user.id);

  if (clearErr) {
    console.error("[email/connections] failed to clear defaults:", clearErr);
    return NextResponse.json({ error: "Failed to update default" }, { status: 500 });
  }

  // Set new default
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
