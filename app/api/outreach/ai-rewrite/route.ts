/**
 * POST /api/outreach/ai-rewrite
 * AI-powered message rewriting for outreach templates.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const TONE_DESCRIPTIONS: Record<string, string> = {
  professional: "Clear, respectful, business-focused",
  casual: "Friendly, conversational, emoji-ok",
  web3_native: "Crypto/DeFi jargon, informal, community-focused",
  formal: "Polished, corporate, no slang",
};

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  const body = await request.json();
  const { message, context, tone } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  let prompt = "You are a Web3 outreach expert for Supra (L1 blockchain). Rewrite this Telegram outreach message to be more engaging and likely to get a reply. Keep it concise (under 200 words), maintain any template variables like {{contact_name}}, and keep the same intent. Return ONLY the rewritten message, no explanation.";

  if (tone && TONE_DESCRIPTIONS[tone]) {
    prompt += ` Write in a ${tone} tone. ${TONE_DESCRIPTIONS[tone]}.`;
  }

  if (context) {
    prompt += `\n\nContext: Sequence "${context.sequence_name ?? ""}", Step ${context.step_number ?? ""}, Board: ${context.board_type ?? "Any"}.`;
  }

  prompt += `\n\nOriginal message:\n${message}`;

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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "Unknown error");
      console.error(`[outreach/ai-rewrite] Anthropic API ${res.status}:`, errBody);
      return NextResponse.json({ error: `AI service error (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    const rewritten = data.content?.[0]?.text ?? "";

    return NextResponse.json({ rewritten });
  } catch (err) {
    console.error("[outreach/ai-rewrite] error:", err);
    return NextResponse.json({ error: "Failed to rewrite message" }, { status: 500 });
  }
}
