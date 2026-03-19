import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { outcome, reason } = await request.json();

  if (!outcome || !["won", "lost", "open"].includes(outcome)) {
    return NextResponse.json({ error: "outcome must be won, lost, or open" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    outcome,
    outcome_reason: reason || null,
    outcome_at: outcome === "open" ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: deal, error } = await supabase
    .from("crm_deals")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[outcome] error:", error);
    return NextResponse.json({ error: "Failed to update outcome" }, { status: 500 });
  }

  return NextResponse.json({ deal, ok: true });
}
