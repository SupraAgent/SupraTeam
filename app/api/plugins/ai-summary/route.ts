import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/plugins/ai-summary
 * Generate a Claude-powered summary of an email thread.
 * Body: { messages: { from: string, date: string, body: string }[] }
 * Returns: { summary, actionItems, sentiment, keyDecisions, suggestedTags }
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rl = rateLimit(`ai-summary:${auth.user.id}`, { max: 10, windowSec: 60 });
  if (rl) return rl;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  let body: {
    messages: { from: string; date: string; body: string }[];
    subject?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.messages || body.messages.length === 0) {
    return NextResponse.json({ error: "No messages provided" }, { status: 400 });
  }

  // Truncate to prevent token explosion
  const maxMessages = 30;
  const truncated = body.messages.slice(-maxMessages);
  const threadText = truncated
    .map((m) => `From: ${m.from}\nDate: ${m.date}\n\n${m.body.slice(0, 3000)}`)
    .join("\n\n---\n\n");

  const prompt = `You are analyzing an email thread for a CRM system used by a blockchain BD team.

Subject: ${body.subject || "Unknown"}

Thread (${truncated.length} messages):
${threadText}

Provide a JSON response with these fields:
- summary: 2-3 sentence summary of the thread
- actionItems: array of action items (strings, max 5)
- sentiment: "positive" | "neutral" | "negative" | "mixed"
- keyDecisions: array of key decisions made (strings, max 3)
- suggestedTags: array of suggested CRM tags from these options: BD, Legal, Marketing, Admin, Finance, Partnership, Technical, Urgent

Return ONLY valid JSON, no markdown.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Anthropic API error:", text);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await res.json();
    const content = data.content?.[0]?.text ?? "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ data: parsed });
  } catch (err) {
    console.error("AI summary error:", err);
    return NextResponse.json({ error: "AI processing failed" }, { status: 500 });
  }
}
