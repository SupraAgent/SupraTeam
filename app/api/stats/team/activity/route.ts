import { NextResponse } from "next/server";
import { requireLeadRole } from "@/lib/auth-guard";

interface RepActivity {
  id: string;
  display_name: string;
  avatar_url: string | null;
  deals_moved: number;
  deals_created: number;
  notes_added: number;
  total_activities: number;
  last_activity_at: string | null;
  key_deals: { deal_name: string; stage_name: string; value: number | null }[];
}

export async function GET(request: Request) {
  const auth = await requireLeadRole();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const hours = Math.min(Number(searchParams.get("hours") || "24"), 168);
  const since = new Date(Date.now() - hours * 3600000).toISOString();

  // Get all team members
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, crm_role")
    .not("display_name", "is", null);

  if (!profiles?.length) return NextResponse.json({ team: [] });

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const userIds = profiles.map((p) => p.id);

  // Fetch activity data in parallel
  const [stageChanges, newDeals, notes] = await Promise.all([
    // Stage changes by team members in the last N hours
    supabase
      .from("crm_deal_stage_history")
      .select("deal_id, changed_by, changed_at, crm_deals(deal_name, value, pipeline_stages(name))")
      .in("changed_by", userIds)
      .gte("changed_at", since)
      .order("changed_at", { ascending: false }),

    // Deals created by team members
    supabase
      .from("crm_deals")
      .select("id, deal_name, created_by, value, pipeline_stages(name)")
      .in("created_by", userIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),

    // Notes added by team members
    supabase
      .from("crm_deal_notes")
      .select("id, deal_id, created_by, created_at")
      .in("created_by", userIds)
      .gte("created_at", since),
  ]);

  // Aggregate per rep
  const repMap = new Map<string, RepActivity>();

  function ensureRep(userId: string): RepActivity {
    if (!repMap.has(userId)) {
      const profile = profileMap.get(userId);
      repMap.set(userId, {
        id: userId,
        display_name: profile?.display_name ?? "Unknown",
        avatar_url: profile?.avatar_url ?? null,
        deals_moved: 0,
        deals_created: 0,
        notes_added: 0,
        total_activities: 0,
        last_activity_at: null,
        key_deals: [],
      });
    }
    return repMap.get(userId)!;
  }

  // Count stage changes
  for (const sc of stageChanges.data ?? []) {
    if (!sc.changed_by) continue;
    const rep = ensureRep(sc.changed_by);
    rep.deals_moved++;
    rep.total_activities++;
    if (!rep.last_activity_at || sc.changed_at > rep.last_activity_at) {
      rep.last_activity_at = sc.changed_at;
    }
    // Add to key deals (dedupe by deal name, max 3)
    const deal = sc.crm_deals as unknown as { deal_name: string; value: number | null; pipeline_stages: { name: string } | null } | null;
    if (deal && rep.key_deals.length < 3 && !rep.key_deals.some((d) => d.deal_name === deal.deal_name)) {
      rep.key_deals.push({
        deal_name: deal.deal_name,
        stage_name: deal.pipeline_stages?.name ?? "Unknown",
        value: deal.value,
      });
    }
  }

  // Count new deals
  for (const d of newDeals.data ?? []) {
    if (!d.created_by) continue;
    const rep = ensureRep(d.created_by);
    rep.deals_created++;
    rep.total_activities++;
    const stage = d.pipeline_stages as unknown as { name: string } | null;
    if (rep.key_deals.length < 3 && !rep.key_deals.some((kd) => kd.deal_name === d.deal_name)) {
      rep.key_deals.push({
        deal_name: d.deal_name,
        stage_name: stage?.name ?? "New",
        value: d.value,
      });
    }
  }

  // Count notes
  for (const n of notes.data ?? []) {
    if (!n.created_by) continue;
    const rep = ensureRep(n.created_by);
    rep.notes_added++;
    rep.total_activities++;
    if (!rep.last_activity_at || n.created_at > rep.last_activity_at) {
      rep.last_activity_at = n.created_at;
    }
  }

  const team = [...repMap.values()]
    .sort((a, b) => b.total_activities - a.total_activities);

  return NextResponse.json({ team });
}
