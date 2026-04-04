import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from("crm_qr_codes")
    .select("*, bot:crm_bots(id, label, bot_username)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "QR code not found" }, { status: 404 });
  }

  // Also fetch scan history
  const { data: scans } = await supabase
    .from("crm_qr_scans")
    .select("*")
    .eq("qr_code_id", id)
    .order("scanned_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ data, scans: scans ?? [], source: "supabase" });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only allow updating specific fields
  const allowed = ["name", "type", "bot_id", "auto_create_group", "group_name_template", "welcome_message", "auto_add_members", "auto_create_deal", "deal_stage_id", "deal_board_type", "campaign_source", "slug_tags", "max_scans", "expires_at", "is_active"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  // Validate auto_add_members if provided
  if ("auto_add_members" in updates) {
    const members = updates.auto_add_members;
    if (!Array.isArray(members)) {
      return NextResponse.json({ error: "auto_add_members must be an array" }, { status: 400 });
    }
    for (const m of members) {
      if (!m || typeof m !== "object" || !("type" in m) || !("id" in m)) {
        return NextResponse.json({ error: "Invalid auto_add_members format" }, { status: 400 });
      }
    }
  }

  const { data, error } = await supabase
    .from("crm_qr_codes")
    .update(updates)
    .eq("id", id)
    .select("*, bot:crm_bots(id, label, bot_username)")
    .single();

  if (error) {
    console.error("[api/qr-codes] update error:", error);
    return NextResponse.json({ error: "Failed to update QR code" }, { status: 500 });
  }

  return NextResponse.json({ data, ok: true });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { error } = await supabase
    .from("crm_qr_codes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[api/qr-codes] delete error:", error);
    return NextResponse.json({ error: "Failed to delete QR code" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
