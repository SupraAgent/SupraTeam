import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHAT_IDS = 100;
const MAX_TITLE_LENGTH = 255;

/** POST /api/telegram/groups/members — add chat(s) to a group */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { group_id?: string; chat_ids?: number[]; chat_titles?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.group_id) return NextResponse.json({ error: "group_id required" }, { status: 400 });
  if (!UUID_RE.test(body.group_id)) return NextResponse.json({ error: "Invalid group_id format" }, { status: 400 });
  if (!body.chat_ids?.length) return NextResponse.json({ error: "chat_ids required" }, { status: 400 });
  if (body.chat_ids.length > MAX_CHAT_IDS) {
    return NextResponse.json({ error: `Too many chat_ids (max ${MAX_CHAT_IDS})` }, { status: 400 });
  }
  if (!body.chat_ids.every((id) => typeof id === "number" && Number.isInteger(id))) {
    return NextResponse.json({ error: "chat_ids must be integers" }, { status: 400 });
  }

  // Verify group ownership
  const { data: group } = await supabase
    .from("crm_tg_chat_groups")
    .select("id")
    .eq("id", body.group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const rows = body.chat_ids.map((chatId) => {
    const title = body.chat_titles?.[String(chatId)] ?? null;
    return {
      group_id: body.group_id!,
      telegram_chat_id: chatId,
      chat_title: title ? title.slice(0, MAX_TITLE_LENGTH) : null,
    };
  });

  const { data, error } = await supabase
    .from("crm_tg_chat_group_members")
    .upsert(rows, { onConflict: "group_id,telegram_chat_id" })
    .select();

  if (error) return NextResponse.json({ error: "Failed to add members" }, { status: 500 });
  return NextResponse.json({ data: data ?? [], added: rows.length });
}

/** DELETE /api/telegram/groups/members — remove chat from group */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const groupId = req.nextUrl.searchParams.get("group_id");
  const chatIdStr = req.nextUrl.searchParams.get("chat_id");
  if (!groupId || !chatIdStr) {
    return NextResponse.json({ error: "group_id and chat_id required" }, { status: 400 });
  }
  if (!UUID_RE.test(groupId)) return NextResponse.json({ error: "Invalid group_id format" }, { status: 400 });

  const chatId = parseInt(chatIdStr, 10);
  if (!Number.isFinite(chatId)) {
    return NextResponse.json({ error: "Invalid chat_id" }, { status: 400 });
  }

  // Verify group ownership
  const { data: group } = await supabase
    .from("crm_tg_chat_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("crm_tg_chat_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("telegram_chat_id", chatId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Member not found in group" }, { status: 404 });
  return NextResponse.json({ data: { removed: true } });
}
