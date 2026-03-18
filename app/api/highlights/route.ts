import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // Expire highlights older than 24h
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("crm_highlights")
    .update({ is_active: false, cleared_at: new Date().toISOString(), cleared_by: "expired" })
    .eq("is_active", true)
    .lt("created_at", twentyFourHoursAgo);

  // Fetch active highlights
  const { data: highlights, error } = await supabase
    .from("crm_highlights")
    .select("id, deal_id, contact_id, sender_name, message_preview, tg_deep_link, highlight_type, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/highlights] error:", error);
    return NextResponse.json({ error: "Failed to fetch highlights" }, { status: 500 });
  }

  // Build lookup maps
  const dealIds = new Set<string>();
  const contactIds = new Set<string>();
  for (const h of highlights ?? []) {
    if (h.deal_id) dealIds.add(h.deal_id);
    if (h.contact_id) contactIds.add(h.contact_id);
  }

  return NextResponse.json({
    highlights: highlights ?? [],
    highlighted_deal_ids: [...dealIds],
    highlighted_contact_ids: [...contactIds],
  });
}
