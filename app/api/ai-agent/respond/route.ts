/**
 * POST /api/ai-agent/respond — Generate an AI response for a Telegram message
 * Used by the bot handler when it receives a message in an AI-enabled chat
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { sanitizeForPrompt } from "@/lib/claude-api";
import { getAnthropicKey } from "@/lib/ai-key";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const apiKey = await getAnthropicKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured. Add your Anthropic key in Settings > Integrations." }, { status: 503 });
  }

  const { tg_chat_id, tg_user_id, user_message, user_name, deal_id } = await request.json();

  if (!tg_chat_id || !user_message) {
    return NextResponse.json({ error: "tg_chat_id and user_message required" }, { status: 400 });
  }

  // Get agent config
  const { data: configs } = await supabase
    .from("crm_ai_agent_config")
    .select("*")
    .eq("is_active", true)
    .limit(1);

  const config = configs?.[0];
  if (!config) {
    return NextResponse.json({ error: "No active AI agent configured" }, { status: 404 });
  }

  // Check for escalation keywords
  const lowerMsg = user_message.toLowerCase();
  const escalationKeywords: string[] = config.escalation_keywords ?? [];
  const shouldEscalate = escalationKeywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));

  // Get recent conversation history for context (expanded from 5 to 15 for multi-day BD conversations)
  const { data: history } = await supabase
    .from("crm_ai_conversations")
    .select("user_message, ai_response")
    .eq("tg_chat_id", tg_chat_id)
    .order("created_at", { ascending: false })
    .limit(15);

  const conversationHistory = (history ?? []).reverse();

  // Get deal context if available
  let dealContext = "";
  if (deal_id) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("deal_name, board_type, value, stage:pipeline_stages(name)")
      .eq("id", deal_id)
      .single();

    if (deal) {
      const stageRaw = deal.stage as unknown;
      const stageName = (stageRaw as { name: string } | null)?.name ?? "Unknown";
      dealContext = `\n\nDeal context: "${deal.deal_name}" (${deal.board_type}), Stage: ${stageName}, Value: ${deal.value ?? "N/A"}`;
    }
  }

  // Build system prompt
  let systemPrompt = config.role_prompt;
  if (config.knowledge_base) {
    systemPrompt += `\n\nKnowledge base:\n${config.knowledge_base}`;
  }
  if (config.auto_qualify) {
    const fields: string[] = config.qualification_fields ?? ["company", "role", "interest"];
    systemPrompt += `\n\nLead qualification: Try to naturally learn about the contact's ${fields.join(", ")}. If you gather any of this info, include a JSON block at the end of your response wrapped in <qualification>{...}</qualification> tags.`;
  }
  if (shouldEscalate) {
    systemPrompt += `\n\nIMPORTANT: The user's message contains an escalation keyword. Acknowledge their request and let them know a team member will follow up shortly. Do NOT try to handle the request yourself.`;
  }
  systemPrompt += dealContext;
  const safeName = sanitizeForPrompt(String(user_name ?? "Unknown"));
  systemPrompt += `\n\nThe user's name is: ${safeName}. Keep responses concise (max 2-3 paragraphs). Use plain text, no markdown.`;

  // Build messages array
  const messages: { role: string; content: string }[] = [];
  for (const h of conversationHistory) {
    messages.push({ role: "user", content: h.user_message });
    messages.push({ role: "assistant", content: h.ai_response });
  }
  messages.push({ role: "user", content: sanitizeForPrompt(user_message) });

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
        max_tokens: config.max_tokens ?? 500,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[ai-agent/respond] API error:", data);
      return NextResponse.json({ error: "AI API error" }, { status: 500 });
    }

    let aiResponse = (data.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");

    // Extract qualification data if present
    let qualificationData = null;
    const qualMatch = aiResponse.match(/<qualification>([\s\S]*?)<\/qualification>/);
    if (qualMatch) {
      try {
        qualificationData = JSON.parse(qualMatch[1]);
        aiResponse = aiResponse.replace(/<qualification>[\s\S]*?<\/qualification>/, "").trim();
      } catch {
        // Ignore parse errors
      }
    }

    // Generate handoff summary on escalation
    let handoffSummary: string | null = null;
    if (shouldEscalate && conversationHistory.length > 0) {
      const summaryMessages = conversationHistory.slice(-5).map((h) =>
        `User: ${h.user_message}\nAI: ${h.ai_response}`
      ).join("\n---\n");
      const qualSummary = qualificationData
        ? `\nQualification data: ${JSON.stringify(qualificationData)}`
        : "";
      handoffSummary = [
        `Contact: ${safeName}`,
        `Escalation trigger: "${escalationKeywords.find((kw) => lowerMsg.includes(kw.toLowerCase()))}"`,
        dealContext ? `Deal: ${dealContext.trim()}` : null,
        qualSummary || null,
        `Conversation (last ${Math.min(5, conversationHistory.length)} messages):`,
        summaryMessages,
        `Latest message: "${user_message}"`,
      ].filter(Boolean).join("\n");
    }

    // Log conversation
    await supabase.from("crm_ai_conversations").insert({
      tg_chat_id: Number(tg_chat_id),
      tg_user_id: Number(tg_user_id ?? 0),
      user_message,
      ai_response: aiResponse,
      qualification_data: qualificationData,
      escalated: shouldEscalate,
      escalation_reason: shouldEscalate ? `Keyword match: ${escalationKeywords.find((kw) => lowerMsg.includes(kw.toLowerCase()))}` : null,
      handoff_summary: handoffSummary,
      agent_config_id: config.id,
      deal_id: deal_id ?? null,
    });

    return NextResponse.json({
      response: aiResponse,
      escalated: shouldEscalate,
      qualification: qualificationData,
      handoff_summary: handoffSummary,
      ok: true,
    });
  } catch (err) {
    console.error("[ai-agent/respond] Error:", err);
    return NextResponse.json({ error: "AI response generation failed" }, { status: 500 });
  }
}
