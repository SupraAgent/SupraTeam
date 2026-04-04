import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { encryptToken, decryptToken } from "@/lib/crypto";

interface IndexedMessage {
  chat_id: number;
  message_id: number;
  sender_id: number | null;
  sender_name: string | null;
  message_text: string | null;
  message_type: string;
  has_media: boolean;
  reply_to_message_id: number | null;
  sent_at: string;
}

/**
 * GET /api/messages/index — Search indexed messages with full-text search.
 *
 * Query params:
 *   q          — full-text search query (required)
 *   chat_id    — filter by chat
 *   sender     — filter by sender name (partial match)
 *   type       — filter by message_type
 *   after      — ISO date, messages after this time
 *   before     — ISO date, messages before this time
 *   cursor     — cursor for pagination (indexed_at of last result)
 *   limit      — results per page (default 50, max 100)
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  // Check indexing is enabled
  const { data: config } = await supabase
    .from("crm_message_index_config")
    .select("indexing_enabled")
    .eq("user_id", user.id)
    .single();

  if (!config?.indexing_enabled) {
    return NextResponse.json(
      { error: "Message indexing is not enabled. Enable it in Settings > Message Indexing." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const chatId = searchParams.get("chat_id");
  const sender = searchParams.get("sender");
  const messageType = searchParams.get("type");
  const after = searchParams.get("after");
  const before = searchParams.get("before");
  const cursor = searchParams.get("cursor");
  const rawLimit = Number(searchParams.get("limit") ?? 50);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100);

  let query = supabase
    .from("crm_message_index")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (q) {
    // Use Postgres full-text search via the search_vector column.
    // Config 'simple' matches the insert-time tsvector config for language-agnostic search.
    query = query.textSearch("search_vector", q, { type: "websearch", config: "simple" });
  }

  if (chatId) {
    query = query.eq("chat_id", Number(chatId));
  }

  if (sender) {
    query = query.ilike("sender_name", `%${sender}%`);
  }

  if (messageType) {
    query = query.eq("message_type", messageType);
  }

  if (after) {
    query = query.gte("sent_at", after);
  }

  if (before) {
    query = query.lte("sent_at", before);
  }

  if (cursor) {
    query = query.lt("sent_at", cursor);
  }

  const { data: messages, error, count } = await query;

  if (error) {
    console.error("[api/messages/index] search error:", error);
    return NextResponse.json({ error: "Failed to search messages" }, { status: 500 });
  }

  // Decrypt message_text for each result
  const decryptedMessages = (messages ?? []).map((msg) => ({
    ...msg,
    message_text: msg.message_text ? safeDecrypt(msg.message_text) : null,
    search_vector: undefined,
  }));

  const nextCursor = decryptedMessages.length === limit
    ? decryptedMessages[decryptedMessages.length - 1]?.sent_at ?? null
    : null;

  return NextResponse.json({
    data: decryptedMessages,
    total: count ?? 0,
    next_cursor: nextCursor,
    limit,
    source: "supabase",
  });
}

/**
 * POST /api/messages/index — Bulk insert indexed messages.
 *
 * Called from the client-side sync module. Messages are encrypted
 * server-side before storage.
 *
 * Body: { messages: IndexedMessage[] }
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  // Check indexing is enabled
  const { data: config } = await supabase
    .from("crm_message_index_config")
    .select("indexing_enabled, indexed_chats, exclude_chats")
    .eq("user_id", user.id)
    .single();

  if (!config?.indexing_enabled) {
    return NextResponse.json(
      { error: "Message indexing is not enabled" },
      { status: 403 }
    );
  }

  let body: { messages: IndexedMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  if (body.messages.length > 500) {
    return NextResponse.json({ error: "Maximum 500 messages per batch" }, { status: 400 });
  }

  const indexedChats: number[] = config.indexed_chats ?? [];
  const excludeChats: number[] = config.exclude_chats ?? [];

  // Filter messages based on chat inclusion/exclusion config
  const filteredMessages = body.messages.filter((msg) => {
    if (excludeChats.includes(msg.chat_id)) return false;
    if (indexedChats.length > 0 && !indexedChats.includes(msg.chat_id)) return false;
    return true;
  });

  if (filteredMessages.length === 0) {
    return NextResponse.json({ data: { inserted: 0 }, source: "filtered" });
  }

  // Build RPC payload: send both encrypted text (for storage) and
  // plaintext (for tsvector computation). The RPC computes search_vector
  // from plain_text server-side — plaintext is never persisted.
  const rpcRows = filteredMessages.map((msg) => ({
    chat_id: msg.chat_id,
    message_id: msg.message_id,
    sender_id: msg.sender_id,
    sender_name: msg.sender_name,
    encrypted_text: msg.message_text ? encryptToken(msg.message_text) : null,
    plain_text: msg.message_text ?? "",
    message_type: msg.message_type || "text",
    has_media: msg.has_media ?? false,
    reply_to_message_id: msg.reply_to_message_id,
    sent_at: msg.sent_at,
  }));

  const { data: insertedCount, error } = await supabase.rpc("crm_bulk_index_messages", {
    p_user_id: user.id,
    p_messages: rpcRows,
  });

  if (error) {
    console.error("[api/messages/index] insert error:", error);
    return NextResponse.json({ error: "Failed to index messages" }, { status: 500 });
  }

  return NextResponse.json({
    data: { inserted: insertedCount ?? 0 },
    source: "supabase",
  });
}

function safeDecrypt(encrypted: string): string {
  try {
    return decryptToken(encrypted);
  } catch {
    return "[decryption failed]";
  }
}
