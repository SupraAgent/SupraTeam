/**
 * POST /api/deals/[id]/conversation/summary — Summarize Telegram conversation thread
 * GET  /api/deals/[id]/conversation/summary — Placeholder (use POST to generate)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  // Fetch deal to get telegram_chat_id
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("id, deal_name, telegram_chat_id")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (!deal.telegram_chat_id) {
    return NextResponse.json({ error: "Deal has no linked Telegram chat" }, { status: 400 });
  }

  // Fetch last 50 messages from the linked chat
  const { data: messages } = await supabase
    .from("tg_group_messages")
    .select("sender_name, message_text, sent_at")
    .eq("telegram_chat_id", deal.telegram_chat_id)
    .order("sent_at", { ascending: false })
    .limit(50);

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "No conversation messages to summarize" }, { status: 400 });
  }

  // Build transcript (chronological order)
  const transcript = [...messages]
    .reverse()
    .map((m) => `[${m.sender_name ?? "Unknown"}]: ${m.message_text ?? ""}`)
    .join("\n");

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
        system: "You are a CRM assistant analyzing Telegram group conversations for a BD team.",
        messages: [{
          role: "user",
          content: `Analyze this Telegram conversation for deal "${deal.deal_name}" and return ONLY valid JSON with this structure:
{
  "key_topics": ["topic1", "topic2"],
  "action_items": ["item1", "item2"],
  "blockers": ["blocker1"],
  "sentiment_shift": "improving" | "stable" | "declining",
  "summary": "2-3 sentence summary of the conversation"
}

key_topics: 3-5 main discussion topics
action_items: concrete next steps mentioned
blockers: concerns or objections raised (empty array if none)
sentiment_shift: overall direction of the conversation tone

Conversation transcript (${messages.length} messages):
${transcript}`,
        }],
      }),
    });

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "{}";

    // Parse JSON from response
    let conversationSummary;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      conversationSummary = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      conversationSummary = null;
    }

    if (!conversationSummary) {
      return NextResponse.json({ error: "Failed to parse conversation summary" }, { status: 500 });
    }

    return NextResponse.json({
      conversation_summary: conversationSummary,
      message_count: messages.length,
      generated_at: new Date().toISOString(),
      ok: true,
    });
  } catch (err) {
    console.error("[conversation-summary] error:", err);
    return NextResponse.json({ error: "Failed to generate conversation summary" }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  return NextResponse.json(
    { error: "Use POST to generate a conversation summary" },
    { status: 404 },
  );
}
