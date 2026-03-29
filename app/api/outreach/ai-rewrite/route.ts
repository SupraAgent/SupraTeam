/**
 * POST /api/outreach/ai-rewrite
 * AI-powered message rewriting for outreach templates.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { TONE_DESCRIPTIONS } from "@/lib/outreach-constants";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  const body = await request.json();
  let { message, context, tone } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Input length limits to mitigate prompt injection
  const MAX_MESSAGE_LEN = 2000;
  const MAX_CONTEXT_LEN = 500;
  message = String(message).slice(0, MAX_MESSAGE_LEN);
  if (context?.sequence_name) context.sequence_name = String(context.sequence_name).slice(0, MAX_CONTEXT_LEN);

  const systemPrompt = "You are a Web3 outreach expert for Supra (L1 blockchain). Rewrite this Telegram outreach message to be more engaging and likely to get a reply. Keep it concise (under 200 words), maintain any template variables like {{contact_name}}, and keep the same intent. Return ONLY the rewritten message, no explanation."
    + (tone && TONE_DESCRIPTIONS[tone] ? ` Write in a ${tone} tone. ${TONE_DESCRIPTIONS[tone]}.` : "");

  let userContent = "";
  if (context) {
    userContent += `Context: Sequence "${context.sequence_name ?? ""}", Step ${context.step_number ?? ""}, Board: ${context.board_type ?? "Any"}.\n\n`;
  }
  userContent += `<user_message>\n${message}\n</user_message>`;

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
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
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
