import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface FolderRow {
  id: string;
  user_id: string;
  telegram_folder_id: number;
  folder_name: string;
  folder_emoji: string | null;
  include_peers: number[];
  exclude_peers: number[];
  is_synced: boolean;
  sync_interval_minutes: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FolderWithCounts extends FolderRow {
  chat_count: number;
  unread_total: number;
}

/** GET /api/telegram/folders — list user's synced folders with chat counts */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: folders, error } = await supabase
    .from("crm_tg_folders")
    .select("*")
    .order("folder_name");

  if (error) {
    console.error("[api/telegram/folders] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }

  // Fetch chat counts and unread totals per folder
  const folderIds = (folders ?? []).map((f: FolderRow) => f.id);
  let chatStats: Record<string, { chat_count: number; unread_total: number }> = {};

  if (folderIds.length > 0) {
    const { data: chats } = await supabase
      .from("crm_tg_folder_chats")
      .select("folder_id, unread_count")
      .in("folder_id", folderIds);

    if (chats) {
      const stats: Record<string, { chat_count: number; unread_total: number }> = {};
      for (const c of chats) {
        const fid = c.folder_id as string;
        if (!stats[fid]) stats[fid] = { chat_count: 0, unread_total: 0 };
        stats[fid].chat_count += 1;
        stats[fid].unread_total += (c.unread_count as number) ?? 0;
      }
      chatStats = stats;
    }
  }

  const result: FolderWithCounts[] = (folders ?? []).map((f: FolderRow) => ({
    ...f,
    chat_count: chatStats[f.id]?.chat_count ?? 0,
    unread_total: chatStats[f.id]?.unread_total ?? 0,
  }));

  return NextResponse.json({ data: result, source: "db" });
}

/** POST /api/telegram/folders — accept folder data pushed from client (GramJS) */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramFolderId = body.telegram_folder_id;
  const folderName = body.folder_name;
  const folderEmoji = body.folder_emoji;
  const includePeers = body.include_peers;
  const excludePeers = body.exclude_peers;
  const chats = body.chats;

  if (typeof telegramFolderId !== "number" || !folderName || typeof folderName !== "string") {
    return NextResponse.json(
      { error: "telegram_folder_id (number) and folder_name (string) are required" },
      { status: 400 },
    );
  }

  if (includePeers !== undefined && !Array.isArray(includePeers)) {
    return NextResponse.json({ error: "include_peers must be an array" }, { status: 400 });
  }
  if (excludePeers !== undefined && !Array.isArray(excludePeers)) {
    return NextResponse.json({ error: "exclude_peers must be an array" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: folder, error: upsertErr } = await supabase
    .from("crm_tg_folders")
    .upsert(
      {
        user_id: user.id,
        telegram_folder_id: telegramFolderId,
        folder_name: folderName,
        folder_emoji: typeof folderEmoji === "string" ? folderEmoji : null,
        include_peers: Array.isArray(includePeers) ? includePeers : [],
        exclude_peers: Array.isArray(excludePeers) ? excludePeers : [],
        is_synced: true,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,telegram_folder_id" },
    )
    .select()
    .single();

  if (upsertErr) {
    console.error("[api/telegram/folders] POST upsert error:", upsertErr);
    return NextResponse.json({ error: "Failed to save folder" }, { status: 500 });
  }

  // If chats were provided, upsert them
  if (Array.isArray(chats) && chats.length > 0 && folder) {
    const chatRows = chats.map((c: Record<string, unknown>) => ({
      folder_id: folder.id,
      chat_id: Number(c.chat_id),
      chat_title: typeof c.chat_title === "string" ? c.chat_title : null,
      chat_type: typeof c.chat_type === "string" ? c.chat_type : null,
      unread_count: typeof c.unread_count === "number" ? c.unread_count : 0,
      last_message_at: typeof c.last_message_at === "string" ? c.last_message_at : null,
      is_pinned: c.is_pinned === true,
    }));

    const { error: chatErr } = await supabase
      .from("crm_tg_folder_chats")
      .upsert(chatRows, { onConflict: "folder_id,chat_id" });

    if (chatErr) {
      console.error("[api/telegram/folders] POST chat upsert error:", chatErr);
      // Non-fatal: folder was saved, chats failed
    }
  }

  return NextResponse.json({ data: folder, source: "db" }, { status: 201 });
}

/** PUT /api/telegram/folders — update folder sync settings */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const folderId = body.id;
  if (typeof folderId !== "string") {
    return NextResponse.json({ error: "id (string) is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.is_synced === "boolean") updates.is_synced = body.is_synced;
  if (typeof body.sync_interval_minutes === "number") {
    const interval = body.sync_interval_minutes;
    if (interval < 5 || interval > 1440) {
      return NextResponse.json({ error: "sync_interval_minutes must be 5-1440" }, { status: 400 });
    }
    updates.sync_interval_minutes = interval;
  }
  if (typeof body.folder_name === "string") updates.folder_name = body.folder_name;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_tg_folders")
    .update(updates)
    .eq("id", folderId)
    .select()
    .single();

  if (error) {
    console.error("[api/telegram/folders] PUT error:", error);
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "db" });
}

/** DELETE /api/telegram/folders — remove a folder sync */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const folderId = body.id;
  if (typeof folderId !== "string") {
    return NextResponse.json({ error: "id (string) is required" }, { status: 400 });
  }

  // CASCADE will delete crm_tg_folder_chats rows
  const { error } = await supabase
    .from("crm_tg_folders")
    .delete()
    .eq("id", folderId);

  if (error) {
    console.error("[api/telegram/folders] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true }, source: "db" });
}
