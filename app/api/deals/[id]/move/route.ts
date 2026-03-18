import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // TODO: Re-enable auth check once Telegram login works
  const { data: { user } } = await supabase.auth.getUser();
  // if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stage_id } = await request.json();
  if (!stage_id) {
    return NextResponse.json({ error: "stage_id is required" }, { status: 400 });
  }

  // Get current stage
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

  // Record stage history
  await supabase.from("crm_deal_stage_history").insert({
    deal_id: id,
    from_stage_id: current.stage_id,
    to_stage_id: stage_id,
    changed_by: user?.id || null,
  });

  // Update deal
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
