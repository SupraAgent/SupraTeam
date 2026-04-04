import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * Batch deal creation from TG folder sync.
 *
 * The browser resolves folder peer IDs against existing deals client-side,
 * then sends only CRM metadata (chat ID + title) to create new deals.
 * No Telegram message content or session data reaches the server.
 */

interface SyncDealPayload {
  telegram_chat_id: number;
  chat_title: string;
  stage_id: string;
  board_type: string;
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { deals?: SyncDealPayload[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { deals } = body;
  if (!Array.isArray(deals) || deals.length === 0) {
    return NextResponse.json({ error: "deals must be a non-empty array" }, { status: 400 });
  }

  const VALID_BOARDS = ["BD", "Marketing", "Admin", "Applications"];
  for (const d of deals) {
    if (!d.telegram_chat_id || !d.chat_title || !d.stage_id || !d.board_type) {
      return NextResponse.json(
        { error: "Each deal requires telegram_chat_id, chat_title, stage_id, and board_type" },
        { status: 400 }
      );
    }
    if (!VALID_BOARDS.includes(d.board_type)) {
      return NextResponse.json(
        { error: `board_type must be one of: ${VALID_BOARDS.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // Deduplicate by telegram_chat_id within the batch
  const chatIds = deals.map((d) => d.telegram_chat_id);
  const uniqueChatIds = [...new Set(chatIds)];

  // Check which chats already have deals (server-side safety net)
  const { data: existing, error: existError } = await supabase
    .from("crm_deals")
    .select("telegram_chat_id")
    .in("telegram_chat_id", uniqueChatIds);

  if (existError) {
    console.error("[api/telegram/folder-sync] lookup error:", existError);
    return NextResponse.json({ error: "Failed to check existing deals" }, { status: 500 });
  }

  const existingChatIds = new Set(
    (existing ?? []).map((d: { telegram_chat_id: number }) => d.telegram_chat_id)
  );

  // Filter to only new deals
  const dealsToCreate = deals.filter(
    (d) => !existingChatIds.has(d.telegram_chat_id)
  );

  if (dealsToCreate.length === 0) {
    return NextResponse.json({
      data: { created: 0, skipped: deals.length, deals: [] },
      source: "supabase",
    });
  }

  const now = new Date().toISOString();
  const inserts = dealsToCreate.map((d) => ({
    deal_name: d.chat_title,
    board_type: d.board_type,
    stage_id: d.stage_id,
    telegram_chat_id: d.telegram_chat_id,
    telegram_chat_name: d.chat_title,
    created_by: user.id,
    stage_changed_at: now,
  }));

  const { data: created, error: insertError } = await supabase
    .from("crm_deals")
    .insert(inserts)
    .select();

  if (insertError) {
    console.error("[api/telegram/folder-sync] insert error:", insertError);
    return NextResponse.json({ error: "Failed to create deals" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      created: created?.length ?? 0,
      skipped: deals.length - dealsToCreate.length,
      deals: created ?? [],
    },
    source: "supabase",
  });
}
