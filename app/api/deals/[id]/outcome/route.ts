import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

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
