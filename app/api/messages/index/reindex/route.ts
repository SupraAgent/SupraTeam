/**
 * GET  /api/messages/index/reindex — Get unindexed messages for client-side reindex.
 * POST /api/messages/index/reindex — Submit reindexed messages with plaintext for tsvector.
 *
 * Zero-knowledge flow:
 * 1. GET returns encrypted messages that have no search_vector
 * 2. Client decrypts, extracts plaintext
 * 3. POST sends plaintext + message IDs back via crm_bulk_index_messages
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(Number(searchParams.get("batch_size") ?? 200), 500);

  const [countResult, batchResult] = await Promise.all([
    supabase.rpc("crm_unindexed_message_count", { p_user_id: user.id }),
    supabase.rpc("crm_unindexed_messages", {
      p_user_id: user.id,
      p_batch_size: batchSize,
    }),
  ]);

  if (countResult.error || batchResult.error) {
    return NextResponse.json(
      { error: countResult.error?.message || batchResult.error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    pending: Number(countResult.data ?? 0),
    messages: batchResult.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  let body: { messages: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  if (body.messages.length > 500) {
    return NextResponse.json({ error: "Max 500 messages per batch" }, { status: 400 });
  }

  const { data: count, error } = await supabase.rpc("crm_bulk_index_messages", {
    p_user_id: user.id,
    p_messages: JSON.stringify(body.messages),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ indexed: count ?? 0 });
}
