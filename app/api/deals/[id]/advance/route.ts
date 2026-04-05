/**
 * POST /api/deals/[id]/advance — Move a deal to the next pipeline stage.
 *
 * Finds the deal's current stage, looks up the next stage by position,
 * and moves the deal forward. Returns the new stage info.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { executeDealMove } from "@/lib/deal-move";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  // Fetch current deal with stage
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("id, stage_id, board_type")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (!deal.stage_id) {
    return NextResponse.json({ error: "Deal has no stage" }, { status: 400 });
  }

  // Get all stages ordered by position
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, name, position, color")
    .order("position");

  if (!stages || stages.length === 0) {
    return NextResponse.json({ error: "No pipeline stages configured" }, { status: 500 });
  }

  const currentIndex = stages.findIndex((s: { id: string }) => s.id === deal.stage_id);
  if (currentIndex === -1) {
    return NextResponse.json({ error: "Current stage not found" }, { status: 500 });
  }

  if (currentIndex >= stages.length - 1) {
    return NextResponse.json({ error: "Already at final stage", stage: stages[currentIndex] }, { status: 400 });
  }

  const nextStage = stages[currentIndex + 1];
  const userName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Unknown";

  const result = await executeDealMove({
    dealId: id,
    toStageId: nextStage.id,
    changedByUserId: user.id,
    changedByName: userName,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Failed to advance deal" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    from_stage: stages[currentIndex],
    to_stage: nextStage,
  });
}
