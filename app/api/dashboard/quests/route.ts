import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const now = new Date();
  const weekStart = new Date(now);
  // Monday-based week (ISO standard, matches Taipei/AU locale)
  const day = weekStart.getDay();
  const diff = day === 0 ? 6 : day - 1; // Sunday=6 days back, Mon=0, Tue=1, etc.
  weekStart.setDate(weekStart.getDate() - diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString();

  const [winsRes, movesRes, contactsRes, dealsCreatedRes] = await Promise.all([
    // Deals closed (won) this week
    supabase
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "won")
      .gte("outcome_at", weekStartIso),
    // Stage moves this week
    supabase
      .from("crm_deal_stage_history")
      .select("id", { count: "exact", head: true })
      .gte("changed_at", weekStartIso),
    // New contacts this week
    supabase
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekStartIso),
    // New deals created this week
    supabase
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekStartIso),
  ]);

  const quests = [
    {
      id: "close-deals",
      title: "Close deals",
      current: winsRes.count ?? 0,
      target: 3,
      icon: "trophy",
      color: "#22c55e",
    },
    {
      id: "move-deals",
      title: "Move deals forward",
      current: movesRes.count ?? 0,
      target: 10,
      icon: "arrow-right",
      color: "#a855f7",
    },
    {
      id: "add-contacts",
      title: "Add new contacts",
      current: contactsRes.count ?? 0,
      target: 5,
      icon: "users",
      color: "#3b82f6",
    },
    {
      id: "create-deals",
      title: "Create new deals",
      current: dealsCreatedRes.count ?? 0,
      target: 5,
      icon: "plus",
      color: "#f59e0b",
    },
  ];

  return NextResponse.json({ quests });
}
