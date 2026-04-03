/**
 * POST /api/deals/[id]/suggest-replies
 * Uses Claude to generate 3 contextual reply suggestions based on recent conversation.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { callClaudeForJson, sanitizeForPrompt } from "@/lib/claude-api";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  // Fetch deal context (including telegram_chat_id to avoid a second query)
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("deal_name, board_type, telegram_chat_id, stage:pipeline_stages(name), contact:crm_contacts(name, company)")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const chatId = (deal as unknown as { telegram_chat_id: number | null }).telegram_chat_id;
  if (!chatId) {
    return NextResponse.json({ error: "No Telegram chat linked to this deal" }, { status: 400 });
  }

  // Fetch recent messages
  const { data: messages } = await supabase
    .from("tg_group_messages")
    .select("sender_name, message_text, is_from_bot, sent_at")
    .eq("telegram_chat_id", chatId)
    .order("sent_at", { ascending: false })
    .limit(10);

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "No conversation to analyze" }, { status: 400 });
  }

  // Sanitize external message content to prevent prompt injection
  const conversationHistory = messages
    .reverse()
    .map((m) => `${sanitizeForPrompt(m.sender_name ?? "Unknown")}${m.is_from_bot ? " (bot)" : ""}: ${sanitizeForPrompt(m.message_text ?? "[media]")}`)
    .join("\n");

  const contactName = (deal.contact as unknown as { name: string } | null)?.name ?? "the contact";
  const company = (deal.contact as unknown as { company: string } | null)?.company ?? "";
  const stage = (deal.stage as unknown as { name: string } | null)?.name ?? "unknown";

  const { data: suggestions, error } = await callClaudeForJson<{ label: string; text: string }>({
    apiKey,
    model: "claude-sonnet-4-20250514",
    maxTokens: 400,
    prompt: `You are a BD/sales assistant for a blockchain company (Supra). Based on this Telegram conversation, suggest 3 short reply options that the rep could send next.

Context:
- Deal: ${sanitizeForPrompt(deal.deal_name)}
- Stage: ${stage}
- Contact: ${sanitizeForPrompt(contactName)}${company ? ` at ${sanitizeForPrompt(company)}` : ""}
- Board: ${deal.board_type}

<conversation>
${conversationHistory}
</conversation>

Return ONLY valid JSON array with exactly 3 objects:
[
  {"label": "short 2-4 word label", "text": "the full reply text (1-3 sentences, professional but friendly)"},
  {"label": "...", "text": "..."},
  {"label": "...", "text": "..."}
]

Make suggestions contextually appropriate: if they asked a question, answer it; if they went quiet, follow up; if they're enthusiastic, advance the deal. Keep replies concise — these are Telegram messages, not emails.`,
  });

  if (error) {
    console.error("[suggest-replies] Claude error:", error);
  }

  // Validate structure: each suggestion must have label + text strings
  const validSuggestions = suggestions
    .filter((s) => typeof s.label === "string" && typeof s.text === "string" && s.label.length > 0 && s.text.length > 0)
    .slice(0, 3);

  return NextResponse.json({ suggestions: validSuggestions, ok: true });
}
