import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const ALLOWED_FIELDS = ["company_id", "is_archived"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;
  const { id } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key];
  }

  const { data: group, error } = await supabase
    .from("tg_groups")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[api/groups] update error:", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }

  return NextResponse.json({ group, ok: true });
}
