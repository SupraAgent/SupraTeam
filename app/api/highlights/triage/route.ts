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
  const { admin: supabase } = auth;

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

  // Fetch deal context for highlights with deal_id
  const dealIds = [...new Set(highlights.filter((h) => h.deal_id).map((h) => h.deal_id))];
  const dealMap = new Map<string, { deal_name: string; stage_name: string }>();
  if (dealIds.length > 0) {
    const { data: deals } = await supabase
      .from("crm_deals")
      .select("id, deal_name, stage:pipeline_stages(name)")
      .in("id", dealIds);
    for (const d of deals ?? []) {
      dealMap.set(d.id, {
        deal_name: d.deal_name,
        stage_name: (d.stage as unknown as { name: string } | null)?.name ?? "unknown",
      });
    }
  }

  // Build highlight descriptions for AI (sanitized to prevent prompt injection)
  const highlightDescriptions = highlights.map((h, i) => {
    const deal = h.deal_id ? dealMap.get(h.deal_id) : null;
    const dealCtx = deal ? ` (Deal: ${sanitizeForPrompt(deal.deal_name)}, Stage: ${deal.stage_name})` : "";
    const msgCount = h.message_count > 1 ? ` [${h.message_count} messages]` : "";
    return `${i + 1}. [${h.highlight_type}] From: ${sanitizeForPrompt(h.sender_name ?? "Unknown")}${dealCtx}${msgCount}\n   Message: "${sanitizeForPrompt(h.message_preview ?? "No preview")}"${h.sentiment ? `\n   Sentiment: ${h.sentiment}` : ""}`;
  }).join("\n");

  const { data: triageResults, error } = await callClaudeForJson<{ index: number; category: string; urgency: string; summary: string }>({
    apiKey,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 600,
    prompt: `You are a CRM triage assistant for a blockchain company (Supra). Categorize these Telegram highlights by urgency and topic.

<highlights>
${highlightDescriptions}
</highlights>

Return ONLY valid JSON array with one object per highlight:
[
  {"index": 1, "category": "short category (e.g. 'partnership inquiry', 'technical question', 'meeting request', 'complaint', 'follow-up needed', 'general chat')", "urgency": "critical|high|medium|low", "summary": "one-sentence actionable summary"}
]

Urgency guide:
- critical: payment issues, urgent deadlines, angry/escalating contacts, deal at risk
- high: direct questions needing response, meeting requests, partnership interest
- medium: follow-ups, general business discussion, feature requests
- low: greetings, casual chat, automated messages, FYI messages`,
  });

  if (error) {
    console.error("[highlights/triage] Claude error:", error);
    return NextResponse.json({ error: "Triage failed: " + error }, { status: 500 });
  }

  // Build update operations and run in parallel
  const triaged: Array<{ id: string; category: string; urgency: string; summary: string }> = [];
  const updatePromises: PromiseLike<unknown>[] = [];

  for (const result of triageResults) {
    const highlight = highlights[result.index - 1];
    if (!highlight) continue;
    if (typeof result.category !== "string" || typeof result.summary !== "string") continue;

    const urgency = ["critical", "high", "medium", "low"].includes(result.urgency) ? result.urgency : "medium";
    const category = result.category.toLowerCase().slice(0, 50);

    updatePromises.push(
      supabase
        .from("crm_highlights")
        .update({
          triage_category: category,
          triage_urgency: urgency,
          triage_summary: result.summary.slice(0, 200),
          triaged_at: new Date().toISOString(),
        })
        .eq("id", highlight.id)
    );

    triaged.push({ id: highlight.id, category, urgency, summary: result.summary });
  }

  await Promise.all(updatePromises);

  return NextResponse.json({ triaged, total: highlights.length });
}
