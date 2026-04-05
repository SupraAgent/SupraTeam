/**
 * POST /api/highlights/triage
 * AI auto-triage: categorizes active highlights by urgency and topic using Claude.
 * Returns triaged highlights with category, urgency level, and summary.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { callClaudeForJson, sanitizeForPrompt } from "@/lib/claude-api";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  // Fetch untriaged active highlights
  const { data: highlights } = await supabase
    .from("crm_highlights")
    .select("id, sender_name, message_preview, highlight_type, priority, sentiment, message_count, created_at, deal_id")
    .eq("is_active", true)
    .is("triaged_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!highlights || highlights.length === 0) {
    return NextResponse.json({ triaged: [], message: "No highlights to triage" });
  }

  // Fetch deal context for highlights with deal_id (stage + value for urgency weighting)
  const dealIds = [...new Set(highlights.filter((h) => h.deal_id).map((h) => h.deal_id))];
  const dealMap = new Map<string, { deal_name: string; stage_name: string; stage_position: number; deal_value: number | null }>();
  if (dealIds.length > 0) {
    const { data: deals } = await supabase
      .from("crm_deals")
      .select("id, deal_name, deal_value, stage:pipeline_stages(name, position)")
      .in("id", dealIds);
    for (const d of deals ?? []) {
      const stage = d.stage as unknown as { name: string; position: number } | null;
      dealMap.set(d.id, {
        deal_name: d.deal_name,
        stage_name: stage?.name ?? "unknown",
        stage_position: stage?.position ?? 0,
        deal_value: d.deal_value ?? null,
      });
    }
  }

  // Build highlight descriptions for AI (sanitized to prevent prompt injection)
  const highlightDescriptions = highlights.map((h, i) => {
    const deal = h.deal_id ? dealMap.get(h.deal_id) : null;
    const dealCtx = deal
      ? ` (Deal: ${sanitizeForPrompt(deal.deal_name)}, Stage: ${deal.stage_name} [${deal.stage_position}/7]${deal.deal_value ? `, Value: $${deal.deal_value.toLocaleString()}` : ""})`
      : "";
    const msgCount = h.message_count > 1 ? ` [${h.message_count} messages]` : "";
    return `${i + 1}. [${h.highlight_type}] From: ${sanitizeForPrompt(h.sender_name ?? "Unknown")}${dealCtx}${msgCount}\n   Message: "${sanitizeForPrompt(h.message_preview ?? "No preview")}"${h.sentiment ? `\n   Sentiment: ${h.sentiment}` : ""}`;
  }).join("\n");

  const { data: triageResults, error } = await callClaudeForJson<{ index: number; category: string; urgency: string; summary: string; reason: string }>({
    apiKey,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 800,
    prompt: `You are a CRM triage assistant for Supra, a blockchain oracle/infrastructure company. Categorize these Telegram highlights for a crypto BD team managing 50+ partner conversations.

<highlights>
${highlightDescriptions}
</highlights>

Return ONLY valid JSON array with one object per highlight:
[
  {"index": 1, "category": "security|deal_risk|time_bound|decision_needed|follow_up|noise", "urgency": "critical|high|medium|low", "summary": "one-sentence actionable summary", "reason": "brief reason for urgency level"}
]

Categories:
- security: exploits, hacks, oracle failures, bridge incidents, price feed issues, smart contract vulnerabilities. Almost always critical.
- deal_risk: competitor displacement signals (mentions of Chainlink/Pyth/Redstone/API3), partner churn signals, TVL drops, team departures, partnership reassessment. Usually critical or high.
- time_bound: TGE/token launch deadlines, vesting cliffs, grant deadlines, governance votes with closing dates, listing deadlines, mainnet deployments. Usually high.
- decision_needed: MOU/contract responses, pricing discussions, token allocation, legal review, board decisions, partnership commitment requests. Usually high.
- follow_up: general business continuity, status updates, integration progress, feature requests, meeting coordination. Usually medium.
- noise: greetings (gm/gn), casual chat, automated bot messages, FYI messages, social pleasantries, already-resolved threads. Always low.

Urgency guide (be conservative — fewer false positives is better than catching everything):
- critical: security incidents, live integration failures, deal about to be lost to competitor, hard deadline in <24h. Response needed within 1 hour.
- high: direct questions from decision-makers, time-sensitive events within 7 days, new high-value partnership interest, MOU/contract responses, technical blockers on active integrations. Response needed within 4 hours.
- medium: follow-ups, general business discussion, integration milestone updates, conference coordination. Response needed within 24 hours.
- low: greetings, automated messages, FYI, casual chat. No time pressure.

Stage-aware weighting: deals in later stages (Follow Up/MOU Signed/First Check Received, positions 5-7) should have their urgency boosted — a "medium" message on a stage-6 deal is effectively "high".

IMPORTANT: Keep critical+high to <30% of items. If unsure, classify as medium. False positives destroy trust faster than false negatives.`,
  });

  if (error) {
    console.error("[highlights/triage] Claude error:", error);
    return NextResponse.json({ error: "Triage failed: " + error }, { status: 500 });
  }

  // Build update operations and run in parallel
  const triaged: Array<{ id: string; category: string; urgency: string; summary: string; reason: string }> = [];
  const updatePromises: PromiseLike<unknown>[] = [];

  const validCategories = ["security", "deal_risk", "time_bound", "decision_needed", "follow_up", "noise"];

  for (const result of triageResults) {
    const highlight = highlights[result.index - 1];
    if (!highlight) continue;
    if (typeof result.category !== "string" || typeof result.summary !== "string") continue;

    const urgency = ["critical", "high", "medium", "low"].includes(result.urgency) ? result.urgency : "medium";
    const rawCategory = result.category.toLowerCase().trim();
    const category = validCategories.includes(rawCategory) ? rawCategory : "follow_up";
    const reason = typeof result.reason === "string" ? result.reason.slice(0, 200) : "";

    updatePromises.push(
      supabase
        .from("crm_highlights")
        .update({
          triage_category: category,
          triage_urgency: urgency,
          triage_summary: `${result.summary.slice(0, 200)}${reason ? ` | ${reason}` : ""}`,
          triaged_at: new Date().toISOString(),
        })
        .eq("id", highlight.id)
    );

    triaged.push({ id: highlight.id, category, urgency, summary: result.summary, reason });
  }

  await Promise.all(updatePromises);

  return NextResponse.json({ triaged, total: highlights.length });
}
