import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  // Get all deals with assigned_to
  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, assigned_to, value, board_type");

  if (!deals) return NextResponse.json({ team: [] });

  // Get profiles for assigned users
  const assignedIds = [...new Set(deals.filter((d) => d.assigned_to).map((d) => d.assigned_to!))];
  if (assignedIds.length === 0) return NextResponse.json({ team: [] });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", assignedIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Aggregate by assignee
  const stats: Record<string, { id: string; display_name: string; avatar_url: string | null; deal_count: number; total_value: number }> = {};
  for (const deal of deals) {
    if (!deal.assigned_to) continue;
    if (!stats[deal.assigned_to]) {
      const profile = profileMap.get(deal.assigned_to);
      stats[deal.assigned_to] = {
        id: deal.assigned_to,
        display_name: profile?.display_name ?? "Unknown",
        avatar_url: profile?.avatar_url ?? null,
        deal_count: 0,
        total_value: 0,
      };
    }
    stats[deal.assigned_to].deal_count++;
    stats[deal.assigned_to].total_value += Number(deal.value ?? 0);
  }

  const team = Object.values(stats).sort((a, b) => b.total_value - a.total_value);

  return NextResponse.json({ team });
}
