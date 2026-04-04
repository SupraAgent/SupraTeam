import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: qrCodes, error } = await supabase
    .from("crm_qr_codes")
    .select("*, stage:pipeline_stages(id, name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/qr-codes] fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch QR codes" }, { status: 500 });
  }

  return NextResponse.json({ data: qrCodes ?? [], source: "supabase" });
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

  const { name, stage_id, board_type } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!stage_id || typeof stage_id !== "string") {
    return NextResponse.json({ error: "stage_id is required" }, { status: 400 });
  }
  if (!board_type || !["BD", "Marketing", "Admin", "Applications"].includes(board_type as string)) {
    return NextResponse.json({ error: "board_type must be BD, Marketing, Admin, or Applications" }, { status: 400 });
  }

  const shortCode = randomBytes(6).toString("base64url").slice(0, 8);

  const { data: qrCode, error } = await supabase
    .from("crm_qr_codes")
    .insert({
      short_code: shortCode,
      name,
      stage_id,
      board_type,
      created_by: user.id,
    })
    .select("*, stage:pipeline_stages(id, name)")
    .single();

  if (error) {
    console.error("[api/qr-codes] insert error:", error);
    return NextResponse.json({ error: "Failed to create QR code" }, { status: 500 });
  }

  return NextResponse.json({ data: qrCode, source: "supabase" });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_qr_codes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[api/qr-codes] delete error:", error);
    return NextResponse.json({ error: "Failed to delete QR code" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
