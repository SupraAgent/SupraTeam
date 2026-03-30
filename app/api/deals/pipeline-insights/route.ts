/**
 * GET /api/deals/pipeline-insights — AI-powered pipeline summary
 * Aggregates deal data and generates an executive summary of pipeline health.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getAnthropicKey } from "@/lib/ai-key";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  // Gather pipeline data
  const [dealsRes, stagesRes] = await Promise.all([
    supabase.from("crm_deals")
      .select("id, deal_name, board_type, value, probability, health_score, outcome, ai_sentiment, ai_summary, updated_at, stage:pipeline_stages(name)")
      .eq("outcome", "open")
      .order("value", { ascending: false })
      .limit(50),
    supabase.from("pipeline_stages").select("id, name, position").order("position"),
  ]);

  const deals = dealsRes.data ?? [];
  const stages = stagesRes.data ?? [];

  if (deals.length === 0) {
    return NextResponse.json({
      insights: null,
      stats: { total: 0, totalValue: 0, avgHealth: 0, atRisk: 0, byBoard: {} },
    });
  }

  // Compute stats
  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  const healthScores = deals.filter((d) => d.health_score != null).map((d) => d.health_score as number);
  const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((s, h) => s + h, 0) / healthScores.length) : 0;
  const atRisk = deals.filter((d) => d.health_score != null && d.health_score < 40).length;

  // Sentiment breakdown
  const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0, unanalyzed: 0 };
  for (const d of deals) {
    const s = d.ai_sentiment as { overall_sentiment?: string } | null;
    if (s?.overall_sentiment) sentimentCounts[s.overall_sentiment] = (sentimentCounts[s.overall_sentiment] ?? 0) + 1;
    else sentimentCounts.unanalyzed++;
  }

  // Momentum breakdown
  const momentumCounts: Record<string, number> = {};
  for (const d of deals) {
    const s = d.ai_sentiment as { momentum?: string } | null;
    if (s?.momentum) momentumCounts[s.momentum] = (momentumCounts[s.momentum] ?? 0) + 1;
  }

  // Board breakdown
  const byBoard: Record<string, { count: number; value: number; avgHealth: number }> = {};
  for (const d of deals) {
    if (!byBoard[d.board_type]) byBoard[d.board_type] = { count: 0, value: 0, avgHealth: 0 };
    byBoard[d.board_type].count++;
    byBoard[d.board_type].value += d.value ?? 0;
  }
  for (const board of Object.keys(byBoard)) {
    const boardDeals = deals.filter((d) => d.board_type === board && d.health_score != null);
    byBoard[board].avgHealth = boardDeals.length > 0 ? Math.round(boardDeals.reduce((s, d) => s + (d.health_score ?? 0), 0) / boardDeals.length) : 0;
  }

  // Stage distribution
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const d of deals) {
    const stageName = (d.stage as unknown as { name: string } | null)?.name ?? "Unknown";
    if (!byStage[stageName]) byStage[stageName] = { count: 0, value: 0 };
    byStage[stageName].count++;
    byStage[stageName].value += d.value ?? 0;
  }

  // Build context for AI
  const riskDeals = deals.filter((d) => d.health_score != null && d.health_score < 40);
  const topDeals = deals.slice(0, 10);

  let context = `Pipeline Overview:\n`;
  context += `- ${deals.length} open deals, total value $${totalValue.toLocaleString()}\n`;
  context += `- Average health: ${avgHealth}/100\n`;
  context += `- At risk (health <40): ${atRisk} deals\n`;
  context += `- Sentiment: ${JSON.stringify(sentimentCounts)}\n`;
  context += `- Momentum: ${JSON.stringify(momentumCounts)}\n\n`;

  context += `By board:\n`;
  for (const [board, data] of Object.entries(byBoard)) {
    context += `- ${board}: ${data.count} deals, $${data.value.toLocaleString()}, avg health ${data.avgHealth}\n`;
  }

  context += `\nBy stage:\n`;
  for (const [stage, data] of Object.entries(byStage)) {
    context += `- ${stage}: ${data.count} deals, $${data.value.toLocaleString()}\n`;
  }

  if (riskDeals.length > 0) {
    context += `\nAt-risk deals:\n`;
    for (const d of riskDeals.slice(0, 5)) {
      const stageName = (d.stage as unknown as { name: string } | null)?.name ?? "?";
      const sentiment = (d.ai_sentiment as { overall_sentiment?: string; momentum?: string } | null);
      context += `- ${d.deal_name} (${stageName}, health: ${d.health_score}, $${d.value?.toLocaleString() ?? 0}, sentiment: ${sentiment?.overall_sentiment ?? "unknown"}, momentum: ${sentiment?.momentum ?? "unknown"})\n`;
    }
  }

  context += `\nTop deals by value:\n`;
  for (const d of topDeals.slice(0, 5)) {
    const stageName = (d.stage as unknown as { name: string } | null)?.name ?? "?";
    context += `- ${d.deal_name}: $${d.value?.toLocaleString() ?? 0} (${stageName}, health: ${d.health_score ?? "?"})\n`;
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
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `You are a CRM analyst. Give a concise executive summary (4-5 sentences max) of this pipeline. Highlight: (1) overall health, (2) biggest risk, (3) biggest opportunity, (4) one recommended action. Be direct and specific — name deals if relevant.\n\n${context}`,
        }],
      }),
    });

    const data = await res.json();
    const insights = data.content?.[0]?.text ?? "Unable to generate insights.";

    return NextResponse.json({
      insights,
      stats: {
        total: deals.length,
        totalValue,
        avgHealth,
        atRisk,
        byBoard,
        byStage,
        sentimentCounts,
        momentumCounts,
      },
    });
  } catch (err) {
    console.error("[pipeline-insights] error:", err);
    return NextResponse.json({
      insights: null,
      stats: {
        total: deals.length,
        totalValue,
        avgHealth,
        atRisk,
        byBoard,
        byStage,
        sentimentCounts,
        momentumCounts,
      },
    });
  }
}
