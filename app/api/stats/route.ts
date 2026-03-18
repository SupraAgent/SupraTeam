import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dealsRes, contactsRes, stagesRes] = await Promise.all([
    supabase.from("crm_deals").select("id, board_type, stage_id, deal_name, created_at, updated_at, value, stage:pipeline_stages(name)").order("updated_at", { ascending: false }),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }),
    supabase.from("pipeline_stages").select("id, name, position").order("position"),
  ]);

  const deals = dealsRes.data ?? [];
  const totalContacts = contactsRes.count ?? 0;
  const stages = stagesRes.data ?? [];

  const byBoard = { BD: 0, Marketing: 0, Admin: 0 };
  const byStage: Record<string, number> = {};
  for (const stage of stages) {
    byStage[stage.id] = 0;
  }
  for (const deal of deals) {
    if (deal.board_type in byBoard) {
      byBoard[deal.board_type as keyof typeof byBoard]++;
    }
    if (deal.stage_id && deal.stage_id in byStage) {
      byStage[deal.stage_id]++;
    }
  }

  const stageBreakdown = stages.map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    count: byStage[s.id] ?? 0,
  }));

  const recentDeals = deals.slice(0, 5).map((d) => ({
    id: d.id,
    deal_name: d.deal_name,
    board_type: d.board_type,
    stage_name: (d.stage as unknown as { name: string } | null)?.name ?? "Unknown",
    value: d.value,
    updated_at: d.updated_at,
  }));

  return NextResponse.json({
    totalDeals: deals.length,
    totalContacts,
    byBoard,
    stageBreakdown,
    recentDeals,
    source: "supabase",
  });
}
