import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";

/**
 * Fire workflow automations for a given trigger type.
 * Uses dynamic import to avoid bundling the workflow engine in the bot process.
 */
async function fireWorkflowTriggers(triggerType: string, payload: Record<string, unknown>) {
  try {
    const { triggerWorkflowsByEvent } = await import("../../lib/workflow-engine");
    await triggerWorkflowsByEvent(triggerType, payload);
  } catch (err) {
    console.error(`[bot/messages] ${triggerType} workflow trigger error:`, err);
  }
}

// ── AI Agent: cached config (refreshed every 60s) ──────────────
interface AgentConfig {
  id: string;
  is_active: boolean;
  respond_to_dms: boolean;
  respond_to_groups: boolean;
  respond_to_mentions: boolean;
  role_prompt: string;
  knowledge_base: string | null;
  qualification_fields: string[];
  auto_qualify: boolean;
  escalation_keywords: string[];
  max_tokens: number;
  auto_create_deals: boolean;
}

let cachedAgentConfig: AgentConfig | null = null;
let configFetchedAt = 0;
const CONFIG_TTL_MS = 60_000;

async function getAgentConfig(): Promise<AgentConfig | null> {
  if (cachedAgentConfig && Date.now() - configFetchedAt < CONFIG_TTL_MS) {
    return cachedAgentConfig;
  }
  const { data } = await supabase
    .from("crm_ai_agent_config")
    .select("*")
    .eq("is_active", true)
    .limit(1);
  cachedAgentConfig = data?.[0] ?? null;
  configFetchedAt = Date.now();
  return cachedAgentConfig;
}

/**
 * Check if a message mentions the bot by @username or reply.
 */
function isBotMentioned(
  messageText: string,
  entities: Array<{ type: string; offset: number; length: number; user?: { id: number } }> | undefined,
  botId: number,
  replyToMessage: { from?: { id: number } } | undefined
): boolean {
  // Direct reply to bot
  if (replyToMessage?.from?.id === botId) return true;
  // @mention in message entities
  if (entities) {
    for (const e of entities) {
      if (e.type === "mention" && e.user?.id === botId) return true;
      if (e.type === "text_mention" && e.user?.id === botId) return true;
    }
  }
  return false;
}

/**
 * Generate AI response and optionally auto-create deal from qualification.
 */
async function handleAIResponse(
  bot: Bot,
  chatId: number,
  userId: number,
  userName: string,
  messageText: string,
  replyToMessageId: number | undefined,
  dealId?: string
): Promise<void> {
  const config = await getAgentConfig();
  if (!config) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  // Check for escalation
  const lowerMsg = messageText.toLowerCase();
  const escalationKeywords: string[] = config.escalation_keywords ?? [];
  const shouldEscalate = escalationKeywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));

  // Get conversation history — scoped by user AND chat to avoid mixing contexts in groups
  const { data: history } = await supabase
    .from("crm_ai_conversations")
    .select("user_message, ai_response")
    .eq("tg_chat_id", chatId)
    .eq("tg_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  const conversationHistory = (history ?? []).reverse();

  // Get deal context if available
  let dealContext = "";
  if (dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("deal_name, board_type, value, stage:pipeline_stages(name)")
      .eq("id", dealId)
      .single();
    if (deal) {
      const stageName = ((deal.stage as unknown) as { name: string } | null)?.name ?? "Unknown";
      dealContext = `\n\nDeal context: "${deal.deal_name}" (${deal.board_type}), Stage: ${stageName}, Value: ${deal.value ?? "N/A"}`;
    }
  }

  // Build system prompt
  let systemPrompt = config.role_prompt;
  if (config.knowledge_base) {
    systemPrompt += `\n\nKnowledge base:\n${config.knowledge_base}`;
  }
  if (config.auto_qualify) {
    const fields = config.qualification_fields ?? ["company", "role", "interest"];
    systemPrompt += `\n\nLead qualification: Try to naturally learn about the contact's ${fields.join(", ")}. If you gather any of this info, include a JSON block at the end of your response wrapped in <qualification>{...}</qualification> tags.`;
  }
  if (shouldEscalate) {
    systemPrompt += `\n\nIMPORTANT: The user's message contains an escalation keyword. Acknowledge their request and let them know a team member will follow up shortly. Do NOT try to handle the request yourself.`;
  }
  systemPrompt += dealContext;
  systemPrompt += `\n\nKeep responses concise (max 2-3 paragraphs). Use plain text, no markdown.`;

  // Build messages array — userName goes in user message context, NOT system prompt
  const messages: { role: string; content: string }[] = [];
  for (const h of conversationHistory) {
    messages.push({ role: "user", content: h.user_message });
    messages.push({ role: "assistant", content: h.ai_response });
  }
  // Prefix the user message with their name as context (safe: in user role, not system)
  const sanitizedName = userName.replace(/[<>{}]/g, "").slice(0, 64);
  messages.push({ role: "user", content: `[${sanitizedName}]: ${messageText}` });

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
      console.error("[bot/ai-agent] API error:", data);
      return;
    }

    let aiResponse = (data.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");

    // Extract qualification data
    let qualificationData: Record<string, string> | null = null;
    const qualMatch = aiResponse.match(/<qualification>([\s\S]*?)<\/qualification>/);
    if (qualMatch) {
      try {
        qualificationData = JSON.parse(qualMatch[1]);
        aiResponse = aiResponse.replace(/<qualification>[\s\S]*?<\/qualification>/, "").trim();
      } catch {
        // Ignore parse errors
      }
    }

    // Log conversation
    await supabase.from("crm_ai_conversations").insert({
      tg_chat_id: chatId,
      tg_user_id: userId,
      user_message: messageText,
      ai_response: aiResponse,
      qualification_data: qualificationData,
      escalated: shouldEscalate,
      escalation_reason: shouldEscalate
        ? `Keyword match: ${escalationKeywords.find((kw) => lowerMsg.includes(kw.toLowerCase()))}`
        : null,
      agent_config_id: config.id,
      deal_id: dealId ?? null,
    });

    // Send response to Telegram
    await bot.api.sendMessage(chatId, aiResponse, {
      reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    });

    // Auto-create deal from qualified lead if enabled
    if (qualificationData && config.auto_create_deals) {
      await autoCreateDealFromQualification(
        chatId, userId, userName, qualificationData
      );
    }
  } catch (err) {
    console.error("[bot/ai-agent] error:", err);
  }
}

/**
 * Auto-create a contact + deal from qualification data extracted by the AI agent.
 * Fires a `lead_qualified` workflow trigger so downstream automations can run.
 */
async function autoCreateDealFromQualification(
  chatId: number,
  userId: number,
  userName: string,
  qualificationData: Record<string, string>
): Promise<void> {
  try {
    // Upsert contact by telegram_user_id (race-safe: DB constraint handles concurrency)
    const { data: upsertedContact, error: contactErr } = await supabase
      .from("crm_contacts")
      .upsert({
        name: userName,
        telegram_user_id: userId,
        company: qualificationData.company || null,
        title: qualificationData.role || null,
        source: "telegram_bot",
        lifecycle_stage: "lead",
        last_activity_at: new Date().toISOString(),
      }, { onConflict: "telegram_user_id" })
      .select("id")
      .single();

    if (contactErr || !upsertedContact) {
      console.error("[bot/ai-agent] contact upsert error:", contactErr);
      return;
    }
    const contactId = upsertedContact.id;

    // Check if there's already an open deal for this contact in this chat
    const { data: existingDeal } = await supabase
      .from("crm_deals")
      .select("id")
      .eq("contact_id", contactId)
      .eq("outcome", "open")
      .limit(1)
      .single();

    if (existingDeal) return; // Don't create duplicate deals

    // Get first pipeline stage
    const { data: firstStage } = await supabase
      .from("pipeline_stages")
      .select("id, name")
      .eq("position", 1)
      .limit(1)
      .single();

    if (!firstStage) return;

    // Find the TG group for chat linking
    const { data: tgGroup } = await supabase
      .from("tg_groups")
      .select("id, group_name")
      .eq("telegram_group_id", chatId)
      .limit(1)
      .single();

    const dealName = qualificationData.company
      ? `${qualificationData.company} — ${qualificationData.interest || "Inbound"}`
      : `${userName} — ${qualificationData.interest || "Inbound Lead"}`;

    const { data: newDeal, error: dealError } = await supabase
      .from("crm_deals")
      .insert({
        deal_name: dealName,
        contact_id: contactId,
        stage_id: firstStage.id,
        board_type: "BD",
        outcome: "open",
        telegram_chat_id: chatId,
        telegram_chat_name: tgGroup?.group_name || null,
        tg_group_id: tgGroup?.id || null,
      })
      .select("id, deal_name")
      .single();

    if (dealError || !newDeal) {
      console.error("[bot/ai-agent] deal creation error:", dealError);
      return;
    }

    console.log(`[bot/ai-agent] Auto-created deal: ${newDeal.deal_name} (${newDeal.id})`);

    // Fire lead_qualified workflow trigger
    fireWorkflowTriggers("lead_qualified", {
      deal_id: newDeal.id,
      deal_name: newDeal.deal_name,
      contact_id: contactId,
      contact_name: userName,
      chat_id: String(chatId),
      qualification: qualificationData,
      stage: firstStage.name,
    });
  } catch (err) {
    console.error("[bot/ai-agent] auto-deal creation error:", err);
  }
}

export function registerMessageHandlers(bot: Bot) {
  // ── DM handler: AI agent responds to private messages ──────────
  bot.on("message:text", async (ctx) => {
    if (ctx.chat.type !== "private") return;

    const config = await getAgentConfig();
    if (!config?.respond_to_dms) return;

    // Don't respond to bot commands
    if (ctx.message.text.startsWith("/")) return;

    await handleAIResponse(
      bot,
      ctx.chat.id,
      ctx.from.id,
      ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ""),
      ctx.message.text,
      ctx.message.message_id
    );
  });

  // ── Group message handler ──────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const chat = ctx.chat;

    // Only process group/supergroup messages
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const chatId = chat.id;
    const messageId = ctx.message.message_id;
    const senderName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : "");
    const senderUsername = ctx.from.username ?? "";
    const messageText = ctx.message.text;

    // Build deep link — only works for supergroups (-100XXXX format)
    const chatIdStr = String(chatId);
    let tgDeepLink = "";
    if (chatIdStr.startsWith("-100")) {
      const supergroupId = chatIdStr.slice(4); // strip "-100"
      tgDeepLink = `https://t.me/c/${supergroupId}/${messageId}`;
    } else if (chat.type === "supergroup" && "username" in chat && chat.username) {
      tgDeepLink = `https://t.me/${chat.username}/${messageId}`;
    }

    try {
      // Find the tg_group record
      const { data: tgGroup } = await supabase
        .from("tg_groups")
        .select("id, group_name")
        .eq("telegram_group_id", chatId)
        .single();

      if (!tgGroup) return; // Not a registered group

      // Fire workflow automations (non-blocking)
      fireWorkflowTriggers("tg_message", {
        chat_id: String(chatId),
        group_name: tgGroup.group_name,
        sender_name: senderName,
        sender_username: senderUsername,
        message_text: messageText,
        message_link: tgDeepLink,
        tg_group_id: tgGroup.id,
      });

      // Find deals linked to this telegram chat
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, board_type, stage_id")
        .eq("telegram_chat_id", chatId);

      // Store full message in tg_group_messages for conversation timeline
      await supabase.from("tg_group_messages").upsert({
        tg_group_id: tgGroup.id,
        telegram_message_id: messageId,
        telegram_chat_id: chatId,
        sender_telegram_id: ctx.from.id,
        sender_name: senderName,
        sender_username: senderUsername || null,
        message_text: messageText,
        message_type: "text",
        reply_to_message_id: ctx.message.reply_to_message?.message_id ?? null,
        sent_at: new Date(ctx.message.date * 1000).toISOString(),
        is_from_bot: false,
      }, { onConflict: "telegram_chat_id,telegram_message_id" });

      // Update contact last_activity_at if contact exists for this TG user
      supabase.from("crm_contacts")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("telegram_user_id", ctx.from.id)
        .then(() => {});

      // AI agent: respond if bot is mentioned or respond_to_groups is enabled
      const config = await getAgentConfig();
      if (config) {
        const botInfo = bot.botInfo;
        const mentioned = isBotMentioned(
          messageText,
          ctx.message.entities as Array<{ type: string; offset: number; length: number; user?: { id: number } }>,
          botInfo.id,
          ctx.message.reply_to_message
        );

        const shouldRespond =
          (config.respond_to_mentions && mentioned) ||
          (config.respond_to_groups && !ctx.from.is_bot);

        if (shouldRespond) {
          const linkedDealId = deals?.[0]?.id;
          // Non-blocking: don't hold up message processing
          handleAIResponse(
            bot, chatId, ctx.from.id, senderName, messageText, messageId, linkedDealId
          ).catch((err) => console.error("[bot/ai-agent] group response error:", err));
        }
      }

      if (!deals || deals.length === 0) return; // No deals linked — skip notifications

      // Create a notification for each linked deal
      for (const deal of deals) {
        await supabase.from("crm_notifications").insert({
          type: "tg_message",
          deal_id: deal.id,
          tg_group_id: tgGroup.id,
          title: `${senderName} in ${tgGroup.group_name}`,
          body: messageText.length > 200 ? messageText.slice(0, 200) + "..." : messageText,
          tg_deep_link: tgDeepLink,
          tg_sender_name: senderName,
          pipeline_link: `/pipeline?highlight=${deal.id}`,
        });
      }
      // Mark deals for AI refresh if significant new messages accumulated
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("tg_group_messages")
          .select("id", { count: "exact", head: true })
          .eq("telegram_chat_id", chatId)
          .gte("sent_at", fiveMinAgo);

        if (count && count >= 10) {
          for (const deal of deals) {
            await supabase.from("crm_deals").update({
              ai_sentiment_at: null,
              ai_summary_at: null,
            }).eq("id", deal.id);
          }
        }
      } catch (refreshErr) {
        console.error("[bot/messages] refresh flag error:", refreshErr);
      }

      // Check for active outreach enrollments targeting this chat (reply detection)
      // Uses RPC for atomic increment to avoid read-modify-write race condition
      try {
        const { data: activeEnrollments } = await supabase
          .from("crm_outreach_enrollments")
          .select("id")
          .eq("tg_chat_id", String(chatId))
          .eq("status", "active");

        if (activeEnrollments && activeEnrollments.length > 0) {
          for (const enrollment of activeEnrollments) {
            // Atomic increment via RPC (defined in migration 048)
            const { error: rpcErr } = await supabase.rpc("increment_enrollment_reply", {
              p_enrollment_id: enrollment.id,
            });
            if (rpcErr) {
              console.error("[bot/messages] reply increment error:", rpcErr);
            }
          }
        }
      } catch (replyErr) {
        console.error("[bot/messages] reply detection error:", replyErr);
      }
    } catch (err) {
      console.error("[bot/messages] error:", err);
    }
  });
}
