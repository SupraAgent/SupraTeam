/**
 * POST /api/messages/index/reindex — Trigger background bulk reindex of existing messages.
 *
 * The client provides batches of plaintext + encrypted messages; the server
 * updates the search_vector via the crm_bulk_index_messages RPC.
 *
 * GET returns the count of un-indexed messages for progress display.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(Number(searchParams.get("batch_size") ?? 500), 1000);

  const { data, error } = await supabase.rpc("crm_bulk_reindex_messages", {
    p_user_id: user.id,
    p_batch_size: batchSize,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data?.[0] ?? { processed: 0, total: 0 };
  return NextResponse.json({
    pending: Number(result.total),
    processed: Number(result.processed),
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
