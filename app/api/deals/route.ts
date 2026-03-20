import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { searchParams } = new URL(request.url);
  const board = searchParams.get("board");
  const tgGroupId = searchParams.get("tg_group_id");

  let query = supabase
    .from("crm_deals")
    .select(`
      *,
      contact:crm_contacts(*),
      stage:pipeline_stages(*)
    `)
    .order("created_at", { ascending: false });

  if (board && board !== "All") {
    query = query.eq("board_type", board);
  }

  if (tgGroupId) {
    query = query.eq("tg_group_id", tgGroupId);
  }

  const { data: deals, error } = await query;

  if (error) {
    console.error("[api/deals] error:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }

  // Fetch assigned profiles separately (FK goes through auth.users, not profiles directly)
  const assignedIds = [...new Set((deals ?? []).map((d) => d.assigned_to).filter(Boolean))];
  let profileMap: Record<string, { display_name: string; avatar_url: string }> = {};

  if (assignedIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", assignedIds);

    if (profiles) {
      for (const p of profiles) {
        profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }
    }
  }

  const enriched = (deals ?? []).map((d) => ({
    ...d,
    assigned_profile: d.assigned_to ? profileMap[d.assigned_to] ?? null : null,
  }));

  return NextResponse.json({ deals: enriched, source: "supabase" });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await request.json();
  const { deal_name, board_type, stage_id, contact_id, assigned_to, value, probability, telegram_chat_id, telegram_chat_name, telegram_chat_link, custom_fields } = body;

  if (!deal_name || !board_type || !stage_id) {
    return NextResponse.json({ error: "deal_name, board_type, and stage_id are required" }, { status: 400 });
  }

  if (!["BD", "Marketing", "Admin"].includes(board_type)) {
    return NextResponse.json({ error: "board_type must be BD, Marketing, or Admin" }, { status: 400 });
  }

  const { data: deal, error } = await supabase
    .from("crm_deals")
    .insert({
      deal_name,
      board_type,
      stage_id,
      contact_id: contact_id || null,
      assigned_to: assigned_to || null,
      value: value || null,
      probability: probability || null,
      telegram_chat_id: telegram_chat_id || null,
      telegram_chat_name: telegram_chat_name || null,
      telegram_chat_link: telegram_chat_link || null,
      created_by: user.id,
      stage_changed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[api/deals] insert error:", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  // Save custom field values
  if (custom_fields && typeof custom_fields === "object" && deal) {
    const fieldValues = Object.entries(custom_fields)
      .filter(([, v]) => v)
      .map(([fieldId, val]) => ({
        deal_id: deal.id,
        field_id: fieldId,
        value: String(val),
      }));

    if (fieldValues.length > 0) {
      await supabase.from("crm_deal_field_values").insert(fieldValues);
    }
  }

  return NextResponse.json({ deal, ok: true });
}
