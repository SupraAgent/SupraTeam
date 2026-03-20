import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/** GET: List broadcast history */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data, error } = await supabase
    .from("crm_broadcasts")
    .select("*, recipients:crm_broadcast_recipients(id, group_name, status, error, sent_at)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ broadcasts: data ?? [] });
}

/** DELETE: Cancel a scheduled broadcast */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_broadcasts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "scheduled");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
