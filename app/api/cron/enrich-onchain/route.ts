import { NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import { computeOnChainScore } from "@/lib/onchain-scoring";
import { logEnrichment } from "@/lib/enrichment-log";

export async function GET(request: Request) {
  const cronErr = verifyCron(request);
  if (cronErr) return cronErr;

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch contacts needing on-chain enrichment:
  // wallet_address IS NOT NULL and (on_chain_score = 0 OR enriched_at is null OR enriched_at < 7 days ago)
  const { data: contacts, error } = await supabase
    .from("crm_contacts")
    .select("id, wallet_address, on_chain_score, enriched_at")
    .not("wallet_address", "is", null)
    .or(`on_chain_score.eq.0,enriched_at.is.null,enriched_at.lt.${sevenDaysAgo}`)
    .limit(20);

  if (error) {
    console.error("[cron/enrich-onchain] Query error:", error);
    return NextResponse.json({ error: "Failed to query contacts" }, { status: 500 });
  }

  let scored = 0;
  for (const contact of contacts ?? []) {
    if (!contact.wallet_address) continue;

    try {
      const result = await computeOnChainScore(contact.wallet_address);
      const now = new Date().toISOString();

      await supabase
        .from("crm_contacts")
        .update({
          on_chain_score: result.score,
          enriched_at: now,
          enrichment_source: "onchain_rpc",
          updated_at: now,
        })
        .eq("id", contact.id);

      const oldScore = contact.on_chain_score != null ? String(contact.on_chain_score) : null;
      if (String(result.score) !== oldScore) {
        logEnrichment(supabase, {
          contact_id: contact.id,
          field_name: "on_chain_score",
          old_value: oldScore,
          new_value: String(result.score),
          source: "onchain_rpc",
        });
      }

      scored++;
    } catch (err) {
      console.error(`[cron/enrich-onchain] Failed for contact ${contact.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, scored, total: contacts?.length ?? 0 });
}
