/**
 * Enrichment pipeline — orchestrates X, on-chain, and AI enrichment steps.
 *
 * Step 1 (parallel): X enrichment + on-chain scoring
 * Step 2 (sequential): AI enrichment using combined data from step 1
 *
 * AI enrichment is optional (opt-in via `includeAI`) and fire-and-forget —
 * if it fails, the X/on-chain enrichment results are still returned.
 */

interface EnrichmentOptions {
  contactId: string;
  /** When true, run AI enrichment after X/on-chain complete. Defaults to false. */
  includeAI?: boolean;
}

interface XEnrichmentResult {
  x_bio: string | null;
  x_followers: number | null;
  enriched_at: string | null;
  enrichment_source: string;
}

interface OnChainResult {
  score: number;
}

interface EnrichmentPipelineResult {
  x: { ok: boolean; data: XEnrichmentResult | null; error: string | null };
  onChain: { ok: boolean; data: OnChainResult | null; error: string | null };
  ai: { ok: boolean; error: string | null } | null;
}

async function runXEnrichment(
  contactId: string
): Promise<{ ok: boolean; data: XEnrichmentResult | null; error: string | null }> {
  try {
    const res = await fetch("/api/contacts/enrich-x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId }),
    });
    if (res.ok) {
      const json = await res.json();
      return { ok: true, data: json.enrichment as XEnrichmentResult, error: null };
    }
    const errJson = await res.json().catch(() => ({ error: "X enrichment failed" }));
    return { ok: false, data: null, error: errJson.error ?? `X API returned ${res.status}` };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function runOnChainEnrichment(
  contactId: string
): Promise<{ ok: boolean; data: OnChainResult | null; error: string | null }> {
  try {
    const res = await fetch("/api/contacts/enrich-onchain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId }),
    });
    if (res.ok) {
      const json = await res.json();
      return { ok: true, data: { score: json.score as number }, error: null };
    }
    const errJson = await res.json().catch(() => ({ error: "On-chain enrichment failed" }));
    return { ok: false, data: null, error: errJson.error ?? `On-chain API returned ${res.status}` };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function runAIEnrichment(
  contactId: string
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch("/api/contacts/enrich-from-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId }),
    });
    if (res.ok) {
      return { ok: true, error: null };
    }
    const errJson = await res.json().catch(() => ({ error: "AI enrichment failed" }));
    return { ok: false, error: errJson.error ?? `AI API returned ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Run the full enrichment pipeline for a contact.
 *
 * Step 1: X enrichment + on-chain scoring run in parallel.
 * Step 2: If `includeAI` is true and X bio text is available,
 *         AI enrichment runs (fire-and-forget on failure).
 */
export async function runEnrichmentPipeline(
  options: EnrichmentOptions
): Promise<EnrichmentPipelineResult> {
  const { contactId, includeAI = false } = options;

  // Step 1: Run X and on-chain enrichment in parallel
  const [xResult, onChainResult] = await Promise.all([
    runXEnrichment(contactId),
    runOnChainEnrichment(contactId),
  ]);

  // Step 2: Optionally run AI enrichment if we have bio data to analyze
  let aiResult: { ok: boolean; error: string | null } | null = null;

  if (includeAI) {
    const hasXBio = xResult.ok && !!xResult.data?.x_bio;

    if (hasXBio) {
      // Fire-and-forget: AI failure should not affect the pipeline result
      try {
        aiResult = await runAIEnrichment(contactId);
      } catch {
        aiResult = { ok: false, error: "AI enrichment threw unexpectedly" };
      }
    } else {
      aiResult = { ok: false, error: "Skipped — no X bio available for AI analysis" };
    }
  }

  return {
    x: xResult,
    onChain: onChainResult,
    ai: aiResult,
  };
}
