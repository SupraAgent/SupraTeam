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
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  const {
    data: broadcasts,
    error,
    count,
  } = await admin
    .from("crm_broadcasts")
    .select(
      "id, message, status, group_count, sent_count, failed_count, scheduled_at, created_at, created_by",
      { count: "exact" }
    )
    .eq("created_by", auth.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[api/v1/broadcasts] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch broadcasts" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: broadcasts ?? [],
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

  const { message, group_ids, scheduled_at } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(group_ids) || group_ids.length === 0) {
    return NextResponse.json(
      { error: "group_ids array is required and must not be empty" },
      { status: 400 }
    );
  }

  // Validate each group_id is a string (UUID format expected)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!group_ids.every((id) => typeof id === "string" && uuidRegex.test(id))) {
    return NextResponse.json(
      { error: "Each group_id must be a valid UUID string" },
      { status: 400 }
    );
  }

  // Create the broadcast record as scheduled (actual sending happens via the bot process)
  const { data: broadcast, error } = await admin
    .from("crm_broadcasts")
    .insert({
      message: (message as string).trim(),
      status: scheduled_at ? "scheduled" : "pending",
      group_count: group_ids.length,
      scheduled_at: scheduled_at || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v1/broadcasts] insert error:", error);
    return NextResponse.json(
      { error: "Failed to create broadcast" },
      { status: 500 }
    );
  }

  // Insert recipient rows
  if (broadcast) {
    const recipients = (group_ids as string[]).map((groupId) => ({
      broadcast_id: broadcast.id,
      group_id: groupId,
      status: "pending",
    }));

    await admin.from("crm_broadcast_recipients").insert(recipients);
  }

  return NextResponse.json({ data: broadcast }, { status: 201 });
}
