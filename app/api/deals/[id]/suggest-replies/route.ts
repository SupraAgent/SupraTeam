/**
 * POST /api/deals/[id]/suggest-replies
 * Uses Claude to generate 3 contextual reply suggestions based on recent conversation.
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

  // Fetch deal context
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("deal_name, board_type, stage:pipeline_stages(name), contact:crm_contacts(name, company)")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Fetch recent messages
  const { data: messages } = await supabase
    .from("tg_group_messages")
    .select("sender_name, message_text, is_from_bot, sent_at")
    .eq("telegram_chat_id", (await supabase.from("crm_deals").select("telegram_chat_id").eq("id", id).single()).data?.telegram_chat_id)
    .order("sent_at", { ascending: false })
    .limit(10);

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "No conversation to analyze" }, { status: 400 });
  }

  const conversationHistory = messages
    .reverse()
    .map((m) => `${m.sender_name ?? "Unknown"}${m.is_from_bot ? " (bot)" : ""}: ${m.message_text ?? "[media]"}`)
    .join("\n");

  const contactName = (deal.contact as unknown as { name: string } | null)?.name ?? "the contact";
  const company = (deal.contact as unknown as { company: string } | null)?.company ?? "";
  const stage = (deal.stage as unknown as { name: string } | null)?.name ?? "unknown";

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
          content: `You are a BD/sales assistant for a blockchain company (Supra). Based on this Telegram conversation, suggest 3 short reply options that the rep could send next.

Context:
- Deal: ${deal.deal_name}
- Stage: ${stage}
- Contact: ${contactName}${company ? ` at ${company}` : ""}
- Board: ${deal.board_type}

Recent conversation:
${conversationHistory}

Return ONLY valid JSON array with exactly 3 objects:
[
  {"label": "short 2-4 word label", "text": "the full reply text (1-3 sentences, professional but friendly)"},
  {"label": "...", "text": "..."},
  {"label": "...", "text": "..."}
]

Make suggestions contextually appropriate: if they asked a question, answer it; if they went quiet, follow up; if they're enthusiastic, advance the deal. Keep replies concise — these are Telegram messages, not emails.`,
        }],
      }),
    });

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "[]";

    let suggestions;
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      suggestions = [];
    }

    return NextResponse.json({ suggestions, ok: true });
  } catch (err) {
    console.error("[suggest-replies] error:", err);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
