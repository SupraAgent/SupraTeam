import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { stage_id } = await request.json();
  if (!stage_id) {
    return NextResponse.json({ error: "stage_id is required" }, { status: 400 });
  }

  const { data: current } = await supabase
    .from("crm_deals")
    .select("stage_id")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (current.stage_id === stage_id) {
    return NextResponse.json({ ok: true, moved: false });
  }

  await supabase.from("crm_deal_stage_history").insert({
    deal_id: id,
    from_stage_id: current.stage_id,
    to_stage_id: stage_id,
    changed_by: null,
  });

  const { data: deal, error } = await supabase
    .from("crm_deals")
    .update({
      stage_id,
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[api/deals/[id]/move] error:", error);
    return NextResponse.json({ error: "Failed to move deal" }, { status: 500 });
  }

  return NextResponse.json({ deal, ok: true, moved: true });
}
