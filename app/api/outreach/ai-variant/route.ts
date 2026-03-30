/**
 * POST /api/outreach/ai-variant
 * AI-powered A/B variant generation for outreach messages.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { TONE_DESCRIPTIONS } from "@/lib/outreach-constants";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
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

  const systemPrompt = "You are a Web3 outreach expert. Generate an alternative version of this Telegram message for A/B testing. Make it meaningfully different in approach (different hook, tone, or structure) while keeping the same intent and any template variables like {{contact_name}}. Return ONLY the alternative message."
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
      console.error(`[outreach/ai-variant] Anthropic API ${res.status}:`, errBody);
      return NextResponse.json({ error: `AI service error (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    const variant = data.content?.[0]?.text ?? "";

    return NextResponse.json({ variant });
  } catch (err) {
    console.error("[outreach/ai-variant] error:", err);
    return NextResponse.json({ error: "Failed to generate variant" }, { status: 500 });
  }
}
