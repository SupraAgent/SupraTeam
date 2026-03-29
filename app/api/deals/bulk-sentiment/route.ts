/**
 * POST /api/deals/bulk-sentiment — Analyze sentiment for all open deals without recent analysis
 * Returns count of analyzed deals. Processes up to 10 deals per call.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizeForPrompt } from "@/lib/claude-api";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  // Find deals that need analysis (no sentiment or older than 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, deal_name, board_type, value, probability, stage:pipeline_stages(name)")
    .eq("outcome", "open")
    .or(`ai_sentiment_at.is.null,ai_sentiment_at.lt.${threeDaysAgo}`)
    .limit(10);

  if (!deals || deals.length === 0) {
    return NextResponse.json({ analyzed: 0, message: "All deals are up to date" });
  }

  let analyzed = 0;
  const errors: string[] = [];

  for (const deal of deals) {
    try {
      // Gather context for this deal
      const [notesRes, notifsRes, historyRes] = await Promise.all([
        supabase.from("crm_deal_notes").select("text").eq("deal_id", deal.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("crm_notifications").select("title, body").eq("deal_id", deal.id).eq("type", "tg_message").order("created_at", { ascending: false }).limit(10),
        supabase.from("crm_deal_stage_history").select("changed_at, from_stage:pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name), to_stage:pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name)").eq("deal_id", deal.id).order("changed_at", { ascending: false }).limit(5),
      ]);

      let conversationText = "";
      if (notifsRes.data?.length) conversationText += "TG messages:\n" + notifsRes.data.map((n) => `- ${sanitizeForPrompt(n.title)}: ${sanitizeForPrompt(n.body ?? "")}`).join("\n") + "\n";
      if (notesRes.data?.length) conversationText += "Notes:\n" + notesRes.data.map((n) => `- ${sanitizeForPrompt(n.text)}`).join("\n") + "\n";
      if (historyRes.data?.length) {
        conversationText += "Stage history:\n" + historyRes.data.map((h) => {
          const from = (h.from_stage as unknown as { name: string } | null)?.name ?? "?";
          const to = (h.to_stage as unknown as { name: string } | null)?.name ?? "?";
          return `- ${from} → ${to}`;
        }).join("\n");
      }

      if (!conversationText.trim()) {
        // No data to analyze — set neutral sentiment
        await supabase.from("crm_deals").update({
          ai_sentiment: { overall_sentiment: "neutral", confidence: 30, engagement_level: "low", tone_keywords: [], risk_signals: ["no conversation data"], momentum: "steady", summary: "No conversation data available for analysis." },
          ai_sentiment_at: new Date().toISOString(),
        }).eq("id", deal.id);
        analyzed++;
        continue;
      }

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
            content: `Analyze the sentiment of this CRM deal. Return ONLY valid JSON:
{"overall_sentiment":"positive"|"neutral"|"negative"|"mixed","confidence":0-100,"engagement_level":"high"|"medium"|"low","tone_keywords":["..."],"risk_signals":["..."],"momentum":"accelerating"|"steady"|"stalling"|"declining","summary":"One sentence summary"}

Deal: ${sanitizeForPrompt(deal.deal_name)} (${(deal.stage as unknown as { name: string } | null)?.name ?? "?"})
${conversationText}`,
          }],
        }),
      });

      const data = await res.json();
      const rawText = data.content?.[0]?.text ?? "{}";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const sentiment = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      if (sentiment) {
        await supabase.from("crm_deals").update({
          ai_sentiment: sentiment,
          ai_sentiment_at: new Date().toISOString(),
        }).eq("id", deal.id);
        analyzed++;
      }
    } catch (err) {
      errors.push(deal.deal_name);
    }
  }

  return NextResponse.json({
    analyzed,
    total: deals.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
