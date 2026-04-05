import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/telegram/folders/[id]/chats — chats in a folder with deal links */
export async function GET(
  _req: NextRequest,
  context: RouteContext,
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id: folderId } = await context.params;

  // Verify folder belongs to user (RLS handles this, but explicit check for clarity)
  const { data: folder, error: folderErr } = await supabase
    .from("crm_tg_folders")
    .select("id")
    .eq("id", folderId)
    .single();

  if (folderErr || !folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const { data: chats, error } = await supabase
    .from("crm_tg_folder_chats")
    .select("*")
    .eq("folder_id", folderId)
    .order("is_pinned", { ascending: false })
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[api/telegram/folders/chats] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 });
  }

  // Look up linked deals by chat_id (telegram_chat_id on crm_deals)
  const chatIds = (chats ?? []).map((c) => c.chat_id);
  let dealMap: Record<string, { id: string; deal_name: string; board_type: string }[]> = {};

  if (chatIds.length > 0) {
    const { data: deals } = await supabase
      .from("crm_deals")
      .select("id, deal_name, board_type, telegram_chat_id")
      .in("telegram_chat_id", chatIds.map(String));

    if (deals) {
      const map: Record<string, { id: string; deal_name: string; board_type: string }[]> = {};
      for (const d of deals) {
        const key = String(d.telegram_chat_id);
        if (!map[key]) map[key] = [];
        map[key].push({ id: d.id, deal_name: d.deal_name, board_type: d.board_type });
      }
      dealMap = map;
    }
  }

  const result = (chats ?? []).map((c) => ({
    ...c,
    linked_deals: dealMap[String(c.chat_id)] ?? [],
  }));

  return NextResponse.json({ data: result, source: "db" });
}

/** POST /api/telegram/folders/[id]/chats — bulk update chat metadata from client sync */
export async function POST(
  req: NextRequest,
  context: RouteContext,
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id: folderId } = await context.params;

  // Verify folder belongs to user
  const { data: folder, error: folderErr } = await supabase
    .from("crm_tg_folders")
    .select("id")
    .eq("id", folderId)
    .single();

  if (folderErr || !folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chats = body.chats;
  if (!Array.isArray(chats)) {
    return NextResponse.json({ error: "chats (array) is required" }, { status: 400 });
  }

  if (chats.length > 500) {
    return NextResponse.json({ error: "Maximum 500 chats per request" }, { status: 400 });
  }

  const rows = chats.map((c: Record<string, unknown>) => ({
    folder_id: folderId,
    chat_id: Number(c.chat_id),
    chat_title: typeof c.chat_title === "string" ? c.chat_title : null,
    chat_type: typeof c.chat_type === "string" ? c.chat_type : null,
    unread_count: typeof c.unread_count === "number" ? c.unread_count : 0,
    last_message_at: typeof c.last_message_at === "string" ? c.last_message_at : null,
    is_pinned: c.is_pinned === true,
  }));

  const { error } = await supabase
    .from("crm_tg_folder_chats")
    .upsert(rows, { onConflict: "folder_id,chat_id" });

  if (error) {
    console.error("[api/telegram/folders/chats] POST error:", error);
    return NextResponse.json({ error: "Failed to update chats" }, { status: 500 });
  }

  // Update folder last_synced_at
  await supabase
    .from("crm_tg_folders")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", folderId);

  return NextResponse.json({ data: { updated: rows.length }, source: "db" });
}
