import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

interface ChatLabel {
  id: string;
  user_id: string;
  telegram_chat_id: number;
  chat_title: string | null;
  chat_type: string | null;
  is_vip: boolean;
  is_archived: boolean;
  is_pinned: boolean;
  is_muted: boolean;
  color_tag: string | null;
  color_tag_color: string | null;
  note: string | null;
  snoozed_until: string | null;
  last_user_message_at: string | null;
  last_contact_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/** GET — fetch all chat labels for the current user */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  // Auto-unsnooze expired entries
  const now = new Date().toISOString();
  await supabase
    .from("crm_chat_labels")
    .update({ snoozed_until: null })
    .eq("user_id", user.id)
    .lt("snoozed_until", now)
    .not("snoozed_until", "is", null);

  const { data, error } = await supabase
    .from("crm_chat_labels")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/chat-labels] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch labels" }, { status: 500 });
  }

  // Build a lookup map by telegram_chat_id for easy client-side access
  const labels: Record<string, ChatLabel> = {};
  for (const row of data ?? []) {
    labels[String(row.telegram_chat_id)] = row;
  }

  return NextResponse.json({ data: labels, source: "db" });
}

/** PUT — upsert a chat label */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await req.json();
  const { telegram_chat_id, chat_title, chat_type, ...fields } = body;

  if (!telegram_chat_id) {
    return NextResponse.json({ error: "telegram_chat_id required" }, { status: 400 });
  }

  // Boolean flags
  const booleanFields = ["is_vip", "is_archived", "is_pinned", "is_muted"];
  // String fields (nullable)
  const stringFields = ["color_tag", "color_tag_color", "note"];
  // Timestamp fields (nullable)
  const timestampFields = ["snoozed_until", "last_user_message_at", "last_contact_message_at"];

  const updates: Record<string, unknown> = {};

  for (const key of booleanFields) {
    if (key in fields && typeof fields[key] === "boolean") {
      updates[key] = fields[key];
    }
  }
  for (const key of stringFields) {
    if (key in fields) {
      let val = fields[key] || null;
      // Validate hex color format
      if (key === "color_tag_color" && val && !/^#[0-9a-fA-F]{6}$/.test(val)) {
        val = null;
      }
      updates[key] = val;
    }
  }
  for (const key of timestampFields) {
    if (key in fields) {
      updates[key] = fields[key] || null;
    }
  }

  const { data, error } = await supabase
    .from("crm_chat_labels")
    .upsert(
      {
        user_id: user.id,
        telegram_chat_id: Number(telegram_chat_id),
        chat_title: chat_title || null,
        chat_type: chat_type || null,
        ...updates,
      },
      { onConflict: "user_id,telegram_chat_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[api/chat-labels] PUT error:", error);
    return NextResponse.json({ error: "Failed to update label" }, { status: 500 });
  }

  return NextResponse.json({ data, source: "db" });
}

/** POST — bulk update labels for multiple chats (merge, not overwrite) */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const body = await req.json();
  const { chat_ids, updates } = body as {
    chat_ids?: number[];
    updates?: Record<string, unknown>;
  };

  if (!chat_ids?.length) {
    return NextResponse.json({ error: "chat_ids required" }, { status: 400 });
  }
  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "updates required" }, { status: 400 });
  }

  // Sanitize updates
  const allowed = ["is_vip", "is_archived", "is_pinned", "is_muted", "color_tag", "color_tag_color", "snoozed_until"];
  const safeUpdates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      safeUpdates[key] = updates[key];
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields in updates" }, { status: 400 });
  }

  // First ensure rows exist for all chat_ids (insert missing ones only)
  const { data: existing } = await supabase
    .from("crm_chat_labels")
    .select("telegram_chat_id")
    .eq("user_id", user.id)
    .in("telegram_chat_id", chat_ids);

  const existingIds = new Set((existing ?? []).map((r: { telegram_chat_id: number }) => r.telegram_chat_id));
  const missingIds = chat_ids.filter((id) => !existingIds.has(id));

  // Insert rows for new chat_ids with only the updates applied
  if (missingIds.length > 0) {
    const newRows = missingIds.map((chatId) => ({
      user_id: user.id,
      telegram_chat_id: chatId,
      ...safeUpdates,
    }));
    const { error: insertError } = await supabase.from("crm_chat_labels").insert(newRows);
    if (insertError) {
      console.error("[api/chat-labels] POST bulk insert error:", insertError);
      return NextResponse.json({ error: "Failed to bulk insert" }, { status: 500 });
    }
  }

  // Update existing rows — merges, does not overwrite other fields
  if (existingIds.size > 0) {
    const { error } = await supabase
      .from("crm_chat_labels")
      .update(safeUpdates)
      .eq("user_id", user.id)
      .in("telegram_chat_id", [...existingIds]);

    if (error) {
      console.error("[api/chat-labels] POST bulk error:", error);
      return NextResponse.json({ error: "Failed to bulk update" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, updated: chat_ids.length });
}

/** DELETE — remove all labels for a chat (resets to default) */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, admin: supabase } = auth;

  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("telegram_chat_id");
  if (!chatId) {
    return NextResponse.json({ error: "telegram_chat_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_chat_labels")
    .delete()
    .eq("user_id", user.id)
    .eq("telegram_chat_id", Number(chatId));

  if (error) {
    console.error("[api/chat-labels] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete label" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
