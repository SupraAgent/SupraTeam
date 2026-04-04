import { NextResponse } from "next/server";
import { requireApiKey, isError } from "@/lib/api-key-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await requireApiKey(request, "read");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const board = searchParams.get("board");
  const stageId = searchParams.get("stage_id");
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  let query = admin
    .from("crm_deals")
    .select(
      `*, contact:crm_contacts(id, name, email, telegram_username, company), stage:pipeline_stages(id, name, position)`,
      { count: "exact" }
    )
    .eq("created_by", auth.userId)
    .order("created_at", { ascending: false });

  if (board && board !== "All") {
    query = query.eq("board_type", board);
  }
  if (stageId) {
    query = query.eq("stage_id", stageId);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: deals, error, count } = await query;

  if (error) {
    console.error("[api/v1/deals] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch deals" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: deals ?? [],
    meta: { total: count ?? 0, limit, offset },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiKey(request, "write");
  if (isError(auth)) return auth.error;

  const limited = rateLimit(`v1:${auth.keyId}`, { max: 100, windowSec: 60 });
  if (limited) return limited;

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { deal_name, board_type, stage_id, contact_id, value, probability } =
    body;

  if (!deal_name || !board_type || !stage_id) {
    return NextResponse.json(
      { error: "deal_name, board_type, and stage_id are required" },
      { status: 400 }
    );
  }

  if (
    !["BD", "Marketing", "Admin", "Applications"].includes(
      board_type as string
    )
  ) {
    return NextResponse.json(
      { error: "board_type must be BD, Marketing, Admin, or Applications" },
      { status: 400 }
    );
  }

  const { data: deal, error } = await admin
    .from("crm_deals")
    .insert({
      deal_name,
      board_type,
      stage_id,
      contact_id: contact_id ?? null,
      value: value ?? null,
      probability: probability ?? null,
      created_by: auth.userId,
      stage_changed_at: new Date().toISOString(),
    })
    .select(
      `*, contact:crm_contacts(id, name, email, telegram_username, company), stage:pipeline_stages(id, name, position)`
    )
    .single();

  if (error) {
    console.error("[api/v1/deals] insert error:", error);
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: deal }, { status: 201 });
}
