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

  // Verify the deal belongs to this user
  const { data: deal } = await admin
    .from("crm_deals")
    .select("id")
    .eq("id", id)
    .eq("created_by", auth.userId)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  const { data: notes, error, count } = await admin
    .from("crm_deal_notes")
    .select("*", { count: "exact" })
    .eq("deal_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[api/v1/deals/[id]/notes] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: notes ?? [],
    meta: { total: count ?? 0, limit, offset },
  });
}

export async function POST(
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

  // Verify the deal belongs to this user
  const { data: deal } = await admin
    .from("crm_deals")
    .select("id")
    .eq("id", id)
    .eq("created_by", auth.userId)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text } = body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "text is required" },
      { status: 400 }
    );
  }

  const { data: note, error } = await admin
    .from("crm_deal_notes")
    .insert({
      deal_id: id,
      text: (text as string).trim(),
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v1/deals/[id]/notes] insert error:", error);
    return NextResponse.json(
      { error: "Failed to add note" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: note }, { status: 201 });
}
