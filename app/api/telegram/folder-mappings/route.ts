import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

/**
 * CRUD for TG folder → pipeline stage mappings.
 *
 * The server only stores mapping configuration (folder_id + stage_id).
 * Telegram folder contents never leave the browser (zero-knowledge).
 */

interface FolderMappingPayload {
  tg_folder_id: number;
  folder_title: string;
  stage_id: string | null;
  board_type: string;
  auto_create: boolean;
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("tg_folder_stage_mappings")
    .select("*")
    .order("folder_title");

  if (error) {
    console.error("[api/telegram/folder-mappings] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch folder mappings" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], source: "supabase" });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { mappings?: FolderMappingPayload[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mappings } = body;
  if (!Array.isArray(mappings)) {
    return NextResponse.json({ error: "mappings must be an array" }, { status: 400 });
  }

  const VALID_BOARDS = ["BD", "Marketing", "Admin", "Applications"];
  for (const m of mappings) {
    if (typeof m.tg_folder_id !== "number" || !m.folder_title) {
      return NextResponse.json(
        { error: "Each mapping requires tg_folder_id (number) and folder_title (string)" },
        { status: 400 }
      );
    }
    if (m.board_type && !VALID_BOARDS.includes(m.board_type)) {
      return NextResponse.json(
        { error: `board_type must be one of: ${VALID_BOARDS.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const now = new Date().toISOString();

  // Delete existing mappings for this user then insert fresh set
  const { error: deleteError } = await supabase
    .from("tg_folder_stage_mappings")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("[api/telegram/folder-mappings] delete error:", deleteError);
    return NextResponse.json({ error: "Failed to clear existing mappings" }, { status: 500 });
  }

  // Only insert mappings that have a stage assigned
  const toInsert = mappings
    .filter((m) => m.stage_id)
    .map((m) => ({
      user_id: user.id,
      tg_folder_id: m.tg_folder_id,
      folder_title: m.folder_title,
      stage_id: m.stage_id,
      board_type: m.board_type || "BD",
      auto_create: m.auto_create ?? false,
      updated_at: now,
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("tg_folder_stage_mappings")
      .insert(toInsert);

    if (insertError) {
      console.error("[api/telegram/folder-mappings] insert error:", insertError);
      return NextResponse.json({ error: "Failed to save mappings" }, { status: 500 });
    }
  }

  // Return the fresh set
  const { data } = await supabase
    .from("tg_folder_stage_mappings")
    .select("*")
    .order("folder_title");

  return NextResponse.json({ data: data ?? [], source: "supabase" });
}
