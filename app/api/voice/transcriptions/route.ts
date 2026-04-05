import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chat_id");
  const dealId = searchParams.get("deal_id");
  const contactId = searchParams.get("contact_id");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  let query = supabase
    .from("crm_voice_transcriptions")
    .select(
      `
      *,
      deal:crm_deals(id, deal_name, board_type),
      contact:crm_contacts(id, name, telegram_username)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (chatId) {
    query = query.eq("chat_id", Number(chatId));
  }
  if (dealId) {
    query = query.eq("linked_deal_id", dealId);
  }
  if (contactId) {
    query = query.eq("linked_contact_id", contactId);
  }
  if (status) {
    query = query.eq("transcription_status", status);
  }
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }
  if (search) {
    query = query.textSearch("transcription_text", search, { type: "websearch" });
  }

  query = query.range(offset, offset + limit - 1);

  const { data: transcriptions, error, count } = await query;

  if (error) {
    console.error("[api/voice/transcriptions] error:", error);
    return NextResponse.json({ error: "Failed to fetch transcriptions" }, { status: 500 });
  }

  return NextResponse.json({
    data: transcriptions ?? [],
    total: count ?? 0,
    limit,
    offset,
    source: "supabase",
  });
}
