import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { computeOnChainScore } from "@/lib/onchain-scoring";
import { logEnrichment } from "@/lib/enrichment-log";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const contactId: string | undefined = body.contact_id;
  if (!contactId) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  // Fetch contact
  const { data: contact, error: fetchErr } = await supabase
    .from("crm_contacts")
    .select("id, wallet_address, on_chain_score")
    .eq("id", contactId)
    .single();

  if (fetchErr || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!contact.wallet_address) {
    return NextResponse.json({ error: "No wallet address set on this contact" }, { status: 400 });
  }

  let result;
  try {
    result = await computeOnChainScore(contact.wallet_address);
  } catch (err) {
    console.error("[enrich-onchain] Score computation error:", err);
    return NextResponse.json(
      { error: "Failed to query Supra RPC — check wallet address and try again" },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("crm_contacts")
    .update({
      on_chain_score: result.score,
      enriched_at: now,
      enrichment_source: "onchain_rpc",
      updated_at: now,
    })
    .eq("id", contactId);

  if (updateErr) {
    console.error("[enrich-onchain] Update error:", updateErr);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }

  // Log the change
  const oldScore = contact.on_chain_score != null ? String(contact.on_chain_score) : null;
  if (String(result.score) !== oldScore) {
    logEnrichment(supabase, {
      contact_id: contactId,
      field_name: "on_chain_score",
      old_value: oldScore,
      new_value: String(result.score),
      source: "onchain_rpc",
      created_by: user.id,
    });
  }

  return NextResponse.json({
    ok: true,
    score: result.score,
    balance: result.balance,
    txCount: result.txCount,
  });
}
