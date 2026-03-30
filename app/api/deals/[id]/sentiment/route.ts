/**
 * POST /api/deals/[id]/sentiment — Analyze sentiment of deal conversations
 * GET  /api/deals/[id]/sentiment — Get cached sentiment data
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizeForPrompt } from "@/lib/claude-api";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  // Gather conversation data
  const [notesRes, notifsRes, historyRes] = await Promise.all([
    supabase.from("crm_deal_notes").select("text, created_at").eq("deal_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("crm_notifications").select("title, body, created_at").eq("deal_id", id).eq("type", "tg_message").order("created_at", { ascending: false }).limit(20),
    supabase.from("crm_deal_stage_history").select("changed_at, from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)").eq("deal_id", id).order("changed_at", { ascending: false }).limit(10),
  ]);

  let conversationText = "";

  if (notifsRes.data && notifsRes.data.length > 0) {
    conversationText += "Telegram messages:\n" + notifsRes.data.map((n) => `- ${sanitizeForPrompt(n.title)}: ${sanitizeForPrompt(n.body ?? "")}`).join("\n") + "\n\n";
  }

  if (notesRes.data && notesRes.data.length > 0) {
    conversationText += "Deal notes:\n" + notesRes.data.map((n) => `- ${sanitizeForPrompt(n.text)}`).join("\n") + "\n\n";
  }

  if (historyRes.data && historyRes.data.length > 0) {
    conversationText += "Stage progression:\n" + historyRes.data.map((h) => {
      const from = (h.from_stage as unknown as { name: string } | null)?.name ?? "?";
      const to = (h.to_stage as unknown as { name: string } | null)?.name ?? "?";
      return `- ${from} → ${to}`;
    }).join("\n");
  }

  if (!conversationText.trim()) {
    return NextResponse.json({ error: "No conversation data to analyze" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Analyze the sentiment and engagement of this CRM deal's conversation history. Return ONLY valid JSON with this structure:
{
  "overall_sentiment": "positive" | "neutral" | "negative" | "mixed",
  "confidence": 0-100,
  "engagement_level": "high" | "medium" | "low",
  "tone_keywords": ["professional", "enthusiastic", etc],
  "risk_signals": ["delayed responses", etc] or [],
  "momentum": "accelerating" | "steady" | "stalling" | "declining",
  "summary": "One sentence summary of sentiment"
}

Conversation data:
${conversationText}`,
        }],
      }),
    });

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "{}";

    // Parse JSON from response
    let sentiment;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      sentiment = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      sentiment = null;
    }

    if (!sentiment) {
      return NextResponse.json({ error: "Failed to parse sentiment" }, { status: 500 });
    }

    // Cache in deal metadata
    await supabase.from("crm_deals").update({
      ai_sentiment: sentiment,
      ai_sentiment_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ sentiment, ok: true });
  } catch (err) {
    console.error("[sentiment] error:", err);
    return NextResponse.json({ error: "Failed to analyze sentiment" }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const { data: deal } = await supabase
    .from("crm_deals")
    .select("ai_sentiment, ai_sentiment_at")
    .eq("id", id)
    .single();

  return NextResponse.json({
    sentiment: deal?.ai_sentiment ?? null,
    generated_at: deal?.ai_sentiment_at ?? null,
  });
}
