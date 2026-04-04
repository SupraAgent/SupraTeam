import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("crm_qr_codes")
    .select("*, bot:crm_bots(id, label, bot_username)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/qr-codes] list error:", error);
    return NextResponse.json({ error: "Failed to fetch QR codes" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], source: "supabase" });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, type, bot_id, auto_create_group, group_name_template, welcome_message, auto_add_members, auto_create_deal, deal_stage_id, deal_board_type, campaign_source, slug_tags, max_scans, expires_at } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!bot_id || typeof bot_id !== "string") {
    return NextResponse.json({ error: "bot_id is required" }, { status: 400 });
  }

  const qrType = type === "company" ? "company" : "personal";

  // Validate auto_add_members format: [{type: "person"|"bot", id: "uuid", label: "..."}]
  const members = Array.isArray(auto_add_members) ? auto_add_members : [];
  for (const m of members) {
    if (!m || typeof m !== "object" || !("type" in m) || !("id" in m)) {
      return NextResponse.json({ error: "Invalid auto_add_members format" }, { status: 400 });
    }
    if (m.type !== "person" && m.type !== "bot") {
      return NextResponse.json({ error: "auto_add_members type must be 'person' or 'bot'" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("crm_qr_codes")
    .insert({
      created_by: user.id,
      name: (name as string).trim(),
      type: qrType,
      bot_id,
      auto_create_group: auto_create_group !== false,
      group_name_template: (group_name_template as string)?.trim() || "{contact_name} × {company}",
      welcome_message: (welcome_message as string)?.trim() || null,
      auto_add_members: members,
      auto_create_deal: auto_create_deal === true,
      deal_stage_id: deal_stage_id || null,
      deal_board_type: deal_board_type || null,
      campaign_source: (campaign_source as string)?.trim() || null,
      slug_tags: Array.isArray(slug_tags) ? slug_tags : [],
      max_scans: typeof max_scans === "number" ? max_scans : null,
      expires_at: expires_at || null,
    })
    .select("*, bot:crm_bots(id, label, bot_username)")
    .single();

  if (error) {
    console.error("[api/qr-codes] insert error:", error);
    return NextResponse.json({ error: "Failed to create QR code" }, { status: 500 });
  }

  return NextResponse.json({ data, ok: true }, { status: 201 });
}
