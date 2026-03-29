/**
 * POST /api/outreach/ai-generate-sequence
 * AI-powered full sequence generation from a goal description.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

const TONE_DESCRIPTIONS: Record<string, string> = {
  professional: "Clear, respectful, business-focused",
  casual: "Friendly, conversational, emoji-ok",
  web3_native: "Crypto/DeFi jargon, informal, community-focused",
  formal: "Polished, corporate, no slang",
};

interface GeneratedStep {
  step_type: string;
  message_template?: string;
  delay_hours: number;
  step_label?: string;
  condition_type?: string;
  condition_config?: Record<string, unknown>;
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  const body = await request.json();
  const { goal, board_type, tone, num_steps } = body;

  if (!goal?.trim()) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const toneKey = tone || "professional";
  const toneDesc = TONE_DESCRIPTIONS[toneKey] ?? TONE_DESCRIPTIONS.professional;
  const stepCount = num_steps || 4;

  const prompt = `You are a Web3 outreach expert for Supra (L1 blockchain). Generate a complete Telegram outreach sequence. Context: ${goal}. Board: ${board_type || "Any"}. Tone: ${toneDesc}.

Return a JSON array of steps, each with:
- step_type: 'message' | 'wait' | 'condition'
- message_template: the message text (use {{contact_name}}, {{company}}, {{deal_name}} variables)
- delay_hours: hours before this step (0 for first)
- step_label: short description
- condition_type: for condition steps only
- condition_config: for condition steps only

Generate ${stepCount} steps. Include at least one condition (reply_received check). Make messages concise, personalized, and focused on ${goal}. Return ONLY the JSON array.`;

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
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "Unknown error");
      console.error(`[outreach/ai-generate-sequence] Anthropic API ${res.status}:`, errBody);
      return NextResponse.json({ error: `AI service error (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "";

    // Parse JSON array from response
    let steps: GeneratedStep[];
    try {
      steps = JSON.parse(rawText);
    } catch {
      try {
        const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : rawText;
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        steps = arrayMatch ? JSON.parse(arrayMatch[0]) : [];
      } catch {
        return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
      }
    }

    // Validate structure
    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "AI returned empty or invalid steps" }, { status: 502 });
    }

    const validated = steps.map((s) => ({
      step_type: ["message", "wait", "condition"].includes(s.step_type) ? s.step_type : "message",
      message_template: s.message_template ?? "",
      delay_hours: typeof s.delay_hours === "number" ? s.delay_hours : 24,
      step_label: s.step_label ?? "",
      condition_type: s.condition_type ?? null,
      condition_config: s.condition_config ?? {},
    }));

    return NextResponse.json({ steps: validated });
  } catch (err) {
    console.error("[outreach/ai-generate-sequence] error:", err);
    return NextResponse.json({ error: "Failed to generate sequence" }, { status: 500 });
  }
}
