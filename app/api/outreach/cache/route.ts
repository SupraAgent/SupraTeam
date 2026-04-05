/**
 * DELETE /api/outreach/cache — Bust the bot-side sequence trigger cache.
 *
 * Writes a timestamp to crm_cache_bust that the bot polls to invalidate
 * its in-memory sequence cache. This avoids the 60s TTL wait when sequences
 * are created or updated.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function DELETE() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { error } = await supabase
    .from("crm_cache_bust")
    .upsert(
      { key: "outreach_sequences", busted_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Sequence cache invalidated" });
}
