import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // Fetch stage history, notifications, and notes in parallel
  const [historyRes, notifsRes, notesRes] = await Promise.all([
    supabase
      .from("crm_deal_stage_history")
      .select("id, from_stage_id, to_stage_id, changed_at, from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)")
      .eq("deal_id", id)
      .order("changed_at", { ascending: false })
      .limit(50),
    supabase
      .from("crm_notifications")
      .select("id, type, title, body, tg_deep_link, created_at")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("crm_deal_notes")
      .select("id, text, created_at")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const activities: Array<{
    id: string;
    type: string;
    title: string;
    body?: string;
    tg_deep_link?: string;
    created_at: string;
  }> = [];

  // Stage changes
  for (const h of historyRes.data ?? []) {
    const fromName = (h.from_stage as unknown as { name: string } | null)?.name ?? "Unknown";
    const toName = (h.to_stage as unknown as { name: string } | null)?.name ?? "Unknown";
    activities.push({
      id: h.id,
      type: "stage_change",
      title: `Moved from ${fromName} to ${toName}`,
      created_at: h.changed_at,
    });
  }

  // TG notifications
  for (const n of notifsRes.data ?? []) {
    activities.push({
      id: n.id,
      type: "tg_message",
      title: n.title,
      body: n.body ?? undefined,
      tg_deep_link: n.tg_deep_link ?? undefined,
      created_at: n.created_at,
    });
  }

  // Notes
  for (const n of notesRes.data ?? []) {
    activities.push({
      id: n.id,
      type: "note",
      title: "Note added",
      body: n.text,
      created_at: n.created_at,
    });
  }

  // Sort by date descending
  activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ activities: activities.slice(0, 50) });
}
