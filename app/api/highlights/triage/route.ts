/**
 * POST /api/highlights/triage
 * AI auto-triage: categorizes active highlights by urgency and topic using Claude.
 * Returns triaged highlights with category, urgency level, and summary.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
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

  // Build highlight descriptions for AI
  const highlightDescriptions = highlights.map((h, i) => {
    const deal = h.deal_id ? dealMap.get(h.deal_id) : null;
    const dealCtx = deal ? ` (Deal: ${deal.deal_name}, Stage: ${deal.stage_name})` : "";
    const msgCount = h.message_count > 1 ? ` [${h.message_count} messages]` : "";
    return `${i + 1}. [${h.highlight_type}] From: ${h.sender_name ?? "Unknown"}${dealCtx}${msgCount}\n   Message: "${h.message_preview ?? "No preview"}"${h.sentiment ? `\n   Sentiment: ${h.sentiment}` : ""}`;
  }).join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a CRM triage assistant for a blockchain company (Supra). Categorize these Telegram highlights by urgency and topic.

Highlights to triage:
${highlightDescriptions}

Return ONLY valid JSON array with one object per highlight:
[
  {"index": 1, "category": "short category (e.g. 'partnership inquiry', 'technical question', 'meeting request', 'complaint', 'follow-up needed', 'general chat')", "urgency": "critical|high|medium|low", "summary": "one-sentence actionable summary"}
]

Urgency guide:
- critical: payment issues, urgent deadlines, angry/escalating contacts, deal at risk
- high: direct questions needing response, meeting requests, partnership interest
- medium: follow-ups, general business discussion, feature requests
- low: greetings, casual chat, automated messages, FYI messages`,
        }],
      }),
    });

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "[]";

    let triageResults: Array<{ index: number; category: string; urgency: string; summary: string }>;
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      triageResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      triageResults = [];
    }

    // Update highlights with triage data
    const triaged: Array<{ id: string; category: string; urgency: string; summary: string }> = [];
    for (const result of triageResults) {
      const highlight = highlights[result.index - 1];
      if (!highlight) continue;

      const urgency = ["critical", "high", "medium", "low"].includes(result.urgency) ? result.urgency : "medium";

      await supabase
        .from("crm_highlights")
        .update({
          triage_category: result.category,
          triage_urgency: urgency,
          triage_summary: result.summary?.slice(0, 200),
          triaged_at: new Date().toISOString(),
        })
        .eq("id", highlight.id);

      triaged.push({
        id: highlight.id,
        category: result.category,
        urgency,
        summary: result.summary,
      });
    }

    return NextResponse.json({ triaged, total: highlights.length });
  } catch (err) {
    console.error("[highlights/triage] error:", err);
    return NextResponse.json({ error: "Triage failed" }, { status: 500 });
  }
}
