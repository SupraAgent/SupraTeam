import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { decryptToken } from "@/lib/crypto";

interface SearchResult {
  message_text: string | null;
  sender_name: string | null;
  chat_id: number;
  chat_title: string;
  chat_type: string;
  message_date: string;
  rank: number;
}

/**
 * GET /api/messages/search — Cross-conversation full-text message search.
 *
 * Query params:
 *   q       — full-text search query (required, min 2 chars)
 *   chat_id — optional: restrict to a single chat
 *   limit   — results per page (default 20, max 50)
 *   offset  — pagination offset (default 0)
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const chatId = searchParams.get("chat_id");
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 50);
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Search query (q) must be at least 2 characters" },
      { status: 400 }
    );
  }

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

  // Use the ranked RPC for relevance-sorted full-text search.
  // Fetch limit+1 to know if there are more results beyond the current page.
  const fetchLimit = limit + offset + 1;

  const { data: rankedMessages, error: rpcError } = await supabase.rpc(
    "crm_search_messages_ranked",
    {
      p_user_id: user.id,
      p_query: q,
      p_chat_id: chatId ? Number(chatId) : null,
      p_after: null,
      p_before: null,
      p_limit: fetchLimit,
    }
  );

  if (rpcError) {
    console.error("[api/messages/search] ranked search error:", rpcError);
    return NextResponse.json(
      { error: "Failed to search messages" },
      { status: 500 }
    );
  }

  const allResults = rankedMessages ?? [];

  // Collect chat IDs from results to enrich with metadata
  const chatIds = [...new Set(allResults.map((m: Record<string, unknown>) => m.chat_id as number))];

  // Lookup chat metadata from tg_groups
  let chatMeta: Record<number, { title: string; type: string }> = {};

  if (chatIds.length > 0) {
    const { data: groups } = await supabase
      .from("tg_groups")
      .select("telegram_group_id, group_name, group_type")
      .in("telegram_group_id", chatIds);

    if (groups) {
      chatMeta = Object.fromEntries(
        groups.map((g: { telegram_group_id: number; group_name: string; group_type: string }) => [
          g.telegram_group_id,
          { title: g.group_name, type: g.group_type },
        ])
      );
    }
  }

  // Apply offset/limit, decrypt, and enrich
  const paginatedResults = allResults.slice(offset, offset + limit);
  const hasMore = allResults.length > offset + limit;

  const enrichedResults: SearchResult[] = paginatedResults.map(
    (msg: Record<string, unknown>) => {
      const cid = msg.chat_id as number;
      const meta = chatMeta[cid];
      return {
        message_text: msg.message_text ? safeDecrypt(msg.message_text as string) : null,
        sender_name: (msg.sender_name as string) ?? null,
        chat_id: cid,
        chat_title: meta?.title ?? `Chat ${cid}`,
        chat_type: meta?.type ?? "unknown",
        message_date: msg.sent_at as string,
        rank: (msg.rank as number) ?? 0,
      };
    }
  );

  return NextResponse.json({
    data: enrichedResults,
    total: hasMore ? offset + limit + 1 : offset + paginatedResults.length,
    has_more: hasMore,
    source: "rpc_ranked",
  });
}

function safeDecrypt(encrypted: string): string {
  try {
    return decryptToken(encrypted);
  } catch {
    return "[decryption failed]";
  }
}
