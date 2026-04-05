import { NextResponse } from "next/server";
import { requireApiKey, isError } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApiKey(request, "read");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: deal, error } = await admin
    .from("crm_deals")
    .select(
      `*, contact:crm_contacts(id, name, email, telegram_username, company), stage:pipeline_stages(id, name, position)`
    )
    .eq("id", id)
    .eq("created_by", auth.userId)
    .single();

  if (error || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json({ data: deal });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApiKey(request, "write");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const ALLOWED_FIELDS = [
    "deal_name",
    "contact_id",
    "board_type",
    "stage_id",
    "value",
    "probability",
    "expected_close_date",
  ];

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in raw) body[key] = raw[key];
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  body.updated_at = new Date().toISOString();

  const { data: deal, error } = await admin
    .from("crm_deals")
    .update(body)
    .eq("id", id)
    .eq("created_by", auth.userId)
    .select(
      `*, contact:crm_contacts(id, name, email, telegram_username, company), stage:pipeline_stages(id, name, position)`
    )
    .single();

  if (error || !deal) {
    console.error("[api/v1/deals/[id]] update error:", error);
    return NextResponse.json(
      { error: "Deal not found or update failed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: deal });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApiKey(request, "write");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { error, count } = await admin
    .from("crm_deals")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("created_by", auth.userId);

  if (error) {
    console.error("[api/v1/deals/[id]] delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete deal" },
      { status: 500 }
    );
  }

  if (count === 0) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
