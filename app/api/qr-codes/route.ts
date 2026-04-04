import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";

  let query = supabase
    .from("crm_qr_codes")
    .select("*, stage:pipeline_stages(id, name)")
    .order("created_at", { ascending: false });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data: qrCodes, error } = await query;

  if (error) {
    console.error("[api/qr-codes] fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch QR codes" }, { status: 500 });
  }

  // Fetch scan counts and conversion counts per QR code
  const ids = (qrCodes ?? []).map((q: { id: string }) => q.id);
  let scanStats: Record<string, { scans: number; conversions: number }> = {};

  if (ids.length > 0) {
    const { data: scans } = await supabase
      .from("crm_qr_scans")
      .select("qr_code_id, converted_to_deal_id")
      .in("qr_code_id", ids);

    for (const scan of scans ?? []) {
      if (!scanStats[scan.qr_code_id]) {
        scanStats[scan.qr_code_id] = { scans: 0, conversions: 0 };
      }
      scanStats[scan.qr_code_id].scans++;
      if (scan.converted_to_deal_id) {
        scanStats[scan.qr_code_id].conversions++;
      }
    }
  }

  const enriched = (qrCodes ?? []).map((q: { id: string; scan_count?: number; [key: string]: unknown }) => ({
    ...q,
    scan_count: scanStats[q.id]?.scans ?? q.scan_count ?? 0,
    conversion_count: scanStats[q.id]?.conversions ?? 0,
  }));

  return NextResponse.json({ data: enriched, source: "supabase" });
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

  const {
    name,
    campaign,
    source,
    pipeline_stage_id,
    assigned_to,
    custom_fields,
    redirect_url,
    expires_at,
  } = body as Record<string, unknown>;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: qrCode, error } = await supabase
    .from("crm_qr_codes")
    .insert({
      user_id: user.id,
      name: (name as string).trim(),
      campaign: campaign ?? null,
      source: source ?? null,
      pipeline_stage_id: pipeline_stage_id ?? null,
      assigned_to: assigned_to ?? null,
      custom_fields: custom_fields ?? {},
      redirect_url: redirect_url ?? null,
      expires_at: expires_at ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/qr-codes] insert error:", error);
    return NextResponse.json({ error: "Failed to create QR code" }, { status: 500 });
  }

  // Build the deep link URL: t.me/BOT_USERNAME?start=qr_QRID
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const deepLink = botUsername
    ? `https://t.me/${botUsername}?start=qr_${qrCode.id}`
    : `qr_${qrCode.id}`;

  return NextResponse.json({ data: { ...qrCode, deep_link: deepLink }, source: "supabase" });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, ...updates } = body as Record<string, unknown>;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Only allow safe fields to be updated
  const allowedFields = [
    "name", "campaign", "source", "pipeline_stage_id",
    "assigned_to", "custom_fields", "redirect_url", "is_active", "expires_at",
  ];
  const safeUpdates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      safeUpdates[key] = updates[key];
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: qrCode, error } = await supabase
    .from("crm_qr_codes")
    .update(safeUpdates)
    .eq("id", id as string)
    .select()
    .single();

  if (error) {
    console.error("[api/qr-codes] update error:", error);
    return NextResponse.json({ error: "Failed to update QR code" }, { status: 500 });
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
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Soft delete: set is_active=false
  const { data: qrCode, error } = await supabase
    .from("crm_qr_codes")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[api/qr-codes] soft delete error:", error);
    return NextResponse.json({ error: "Failed to deactivate QR code" }, { status: 500 });
  }

  return NextResponse.json({ data: qrCode, source: "supabase" });
}
