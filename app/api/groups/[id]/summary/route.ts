/**
 * POST /api/groups/[id]/summary
 * Generate an AI summary of recent conversation in a Telegram group.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { callClaudeForText, sanitizeForPrompt } from "@/lib/claude-api";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { admin: supabase } = auth;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  // Fetch group info
  const { data: group } = await supabase
    .from("tg_groups")
    .select("id, group_name, telegram_group_id")
    .eq("id", id)
    .single();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Fetch last 50 messages
  const { data: messages } = await supabase
    .from("tg_group_messages")
    .select("sender_name, message_text, sent_at, is_from_bot")
    .eq("tg_group_id", id)
    .order("sent_at", { ascending: false })
    .limit(50);

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "No messages to summarize" }, { status: 400 });
  }

  const conversation = messages
    .reverse()
    .map((m) => `[${m.sent_at.slice(0, 16)}] ${sanitizeForPrompt(m.sender_name ?? "Unknown")}${m.is_from_bot ? " (bot)" : ""}: ${sanitizeForPrompt(m.message_text ?? "[media]")}`)
    .join("\n");

  const { text, error } = await callClaudeForText({
    apiKey,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 500,
    prompt: `Summarize this Telegram group conversation from "${sanitizeForPrompt(group.group_name)}". Be concise and actionable.

<conversation>
${conversation}
</conversation>

Format:
**Key Topics:** bullet list of main topics discussed
**Decisions Made:** any agreements or decisions (or "None")
**Action Items:** things someone needs to do (or "None")
**Sentiment:** overall tone (positive/neutral/negative/mixed)

Keep it under 200 words.`,
  });

  if (error) {
    return NextResponse.json({ error: "Summary failed: " + error }, { status: 500 });
  }

  return NextResponse.json({
    summary: text,
    message_count: messages.length,
    timespan: {
      from: messages[0].sent_at,
      to: messages[messages.length - 1].sent_at,
    },
  });
}
