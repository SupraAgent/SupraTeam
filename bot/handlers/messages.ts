import type { Bot } from "grammy";
import { supabase } from "../lib/supabase.js";
import { pushToDealAssignee, sendTMAPush } from "./push-notifications.js";

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

/**
 * Dispatch a webhook event (non-blocking).
 * Uses dynamic import to avoid bundling webhook lib in the bot process.
 */
async function fireWebhookEvent(eventType: string, payload: Record<string, unknown>) {
  try {
    const { dispatchWebhook } = await import("../../lib/webhooks");
    await dispatchWebhook(eventType as import("../../lib/webhooks").WebhookEvent, payload);
  } catch (err) {
    console.error(`[bot/messages] webhook ${eventType} error:`, err);
  }
}

// ── Team member detection cache (refreshed every 60s) ──────────
let cachedTeamTelegramIds: Set<number> = new Set();
let teamIdsFetchedAt = 0;
const TEAM_IDS_TTL_MS = 60_000;

async function getTeamTelegramIds(): Promise<Set<number>> {
  if (cachedTeamTelegramIds.size > 0 && Date.now() - teamIdsFetchedAt < TEAM_IDS_TTL_MS) {
    return cachedTeamTelegramIds;
  }
  const { data } = await supabase
    .from("profiles")
    .select("telegram_id")
    .not("telegram_id", "is", null);
  const ids = new Set<number>();
  if (data) {
    for (const p of data) {
      if (p.telegram_id) ids.add(Number(p.telegram_id));
    }
  }
  cachedTeamTelegramIds = ids;
  teamIdsFetchedAt = Date.now();
  return ids;
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
  replyToMessage: { from?: { id: number } } | undefined,
  botUsername?: string
): boolean {
  // Direct reply to bot
  if (replyToMessage?.from?.id === botId) return true;
  // @mention in message entities
  if (entities) {
    for (const e of entities) {
      // text_mention includes user object
      if (e.type === "text_mention" && e.user?.id === botId) return true;
      // Standard @username mention: extract text and compare to bot username
      if (e.type === "mention" && botUsername) {
        const mentionText = messageText.substring(e.offset, e.offset + e.length);
        if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) return true;
      }
    }
  }
  return false;
}

// ── Rate limiter for group AI responses (per-chat cooldown) ──────
const groupResponseCooldowns = new Map<number, number>();
const GROUP_RESPONSE_COOLDOWN_MS = 60_000; // 1 response per 60s per chat

function canRespondInGroup(chatId: number): boolean {
  const lastResponse = groupResponseCooldowns.get(chatId) ?? 0;
  if (Date.now() - lastResponse < GROUP_RESPONSE_COOLDOWN_MS) return false;
  groupResponseCooldowns.set(chatId, Date.now());
  return true;
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
  dealId?: string,
  isDM = false
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

  // Get deal context if available — ONLY if the deal belongs to this chat
  let dealContext = "";
  if (dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("deal_name, board_type, value, telegram_chat_id, stage:pipeline_stages(name)")
      .eq("id", dealId)
      .single();
    // Context boundary: only inject deal info if it belongs to this chat
    if (deal && String(deal.telegram_chat_id) === String(chatId)) {
      const stageName = ((deal.stage as unknown) as { name: string } | null)?.name ?? "Unknown";
      dealContext = `\n\nDeal context: "${deal.deal_name}" (${deal.board_type}), Stage: ${stageName}, Value: ${deal.value ?? "N/A"}`;
    } else if (deal && deal.telegram_chat_id && String(deal.telegram_chat_id) !== String(chatId)) {
      console.warn(`[bot/ai-agent] Context boundary: deal ${dealId} belongs to chat ${deal.telegram_chat_id}, not ${chatId}. Skipping context.`);
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
      is_private_dm: isDM,
    });

    // Push escalation notification to assigned rep + admin
    if (shouldEscalate && dealId) {
      const matchedKeyword = escalationKeywords.find((kw) => lowerMsg.includes(kw.toLowerCase()));
      pushToDealAssignee(
        bot,
        dealId,
        "escalation",
        `⚠️ Escalation: ${userName}`,
        `Keyword "${matchedKeyword}" detected: ${messageText}`
      ).catch((err) => console.error("[bot/ai-agent] escalation push error:", err));

      // Also push to admin_lead users
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .eq("crm_role", "admin_lead");

      if (admins) {
        for (const admin of admins) {
          sendTMAPush(bot, {
            userId: admin.id,
            triggerType: "escalation",
            title: `⚠️ Escalation: ${userName}`,
            body: `Keyword "${matchedKeyword}" detected: ${messageText}`,
            tmaPath: `/tma/deals/${dealId}`,
            dealId,
          }).catch((err) => console.error("[bot/ai-agent] admin escalation push error:", err));
        }
      }
    }

    // Send response to Telegram (with delivery tracking)
    await bot.api.sendMessage(chatId, aiResponse, {
      reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    });
    // Non-blocking delivery log
    supabase.from("crm_notification_log").insert({
      notification_type: isDM ? "ai_dm_response" : "ai_group_response",
      tg_chat_id: chatId,
      message_preview: aiResponse.length > 200 ? aiResponse.slice(0, 200) + "..." : aiResponse,
      status: "sent",
      sent_at: new Date().toISOString(),
    }).then(() => {});

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

    // Don't respond to bot commands
    if (ctx.message.text.startsWith("/")) return;

    const senderName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : "");
    const senderUsername = ctx.from.username ?? "";

    // Fire bot_dm_received workflow trigger (always, even if AI agent is off)
    fireWorkflowTriggers("bot_dm_received", {
      sender_id: ctx.from.id,
      sender_name: senderName,
      sender_username: senderUsername,
      message_text: ctx.message.text,
      chat_id: ctx.chat.id,
    }).catch(() => {});

    const config = await getAgentConfig();
    if (!config?.respond_to_dms) return;

    await handleAIResponse(
      bot,
      ctx.chat.id,
      ctx.from.id,
      senderName,
      ctx.message.text,
      ctx.message.message_id,
      undefined, // no dealId in DMs
      true // isDM
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

      // Find deals linked to this telegram chat (include assigned_to for push notifications)
      const { data: deals } = await supabase
        .from("crm_deals")
        .select("id, deal_name, board_type, stage_id, assigned_to, contact_id")
        .eq("telegram_chat_id", chatId);

      // Detect media in message
      const msg = ctx.message;
      let detectedMediaType: string | null = null;
      let detectedMediaFileId: string | null = null;
      let detectedMediaThumbId: string | null = null;
      let detectedMediaMime: string | null = null;
      let detectedMediaSize: number | null = null;

      if (msg.photo && msg.photo.length > 0) {
        detectedMediaType = "photo";
        detectedMediaFileId = msg.photo[msg.photo.length - 1].file_id;
        if (msg.photo.length > 1) detectedMediaThumbId = msg.photo[0].file_id;
      } else if (msg.document) {
        detectedMediaType = "document";
        detectedMediaFileId = msg.document.file_id;
        detectedMediaThumbId = msg.document.thumbnail?.file_id ?? null;
        detectedMediaMime = msg.document.mime_type ?? null;
        detectedMediaSize = msg.document.file_size ?? null;
      } else if (msg.video) {
        detectedMediaType = "video";
        detectedMediaFileId = msg.video.file_id;
        detectedMediaThumbId = msg.video.thumbnail?.file_id ?? null;
        detectedMediaMime = msg.video.mime_type ?? null;
      } else if (msg.voice) {
        detectedMediaType = "voice";
        detectedMediaFileId = msg.voice.file_id;
        detectedMediaMime = msg.voice.mime_type ?? null;
      } else if (msg.sticker) {
        detectedMediaType = "sticker";
        detectedMediaFileId = msg.sticker.file_id;
        detectedMediaThumbId = msg.sticker.thumbnail?.file_id ?? null;
      } else if (msg.animation) {
        detectedMediaType = "animation";
        detectedMediaFileId = msg.animation.file_id;
        detectedMediaThumbId = msg.animation.thumbnail?.file_id ?? null;
      }

      // Store full message in tg_group_messages for conversation timeline
      await supabase.from("tg_group_messages").upsert({
        tg_group_id: tgGroup.id,
        telegram_message_id: messageId,
        telegram_chat_id: chatId,
        sender_telegram_id: ctx.from.id,
        sender_name: senderName,
        sender_username: senderUsername || null,
        message_text: messageText || (msg.caption ?? null),
        message_type: detectedMediaType ? detectedMediaType : "text",
        media_type: detectedMediaType,
        media_file_id: detectedMediaFileId,
        media_thumb_id: detectedMediaThumbId,
        media_mime: detectedMediaMime,
        media_size_bytes: detectedMediaSize,
        reply_to_message_id: ctx.message.reply_to_message?.message_id ?? null,
        sent_at: new Date(ctx.message.date * 1000).toISOString(),
        is_from_bot: false,
      }, { onConflict: "telegram_chat_id,telegram_message_id" });

      // Fire group.message webhook (non-blocking)
      fireWebhookEvent("group.message", {
        chat_id: chatId,
        group_name: tgGroup.group_name,
        sender_name: senderName,
        sender_username: senderUsername,
        message_text: messageText,
        message_type: detectedMediaType || "text",
        sent_at: new Date(ctx.message.date * 1000).toISOString(),
      }).catch(() => {});

      // Update contact last_activity_at if contact exists for this TG user (non-blocking)
      supabase.from("crm_contacts")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("telegram_user_id", ctx.from.id)
        .then(({ error }) => { if (error) console.error("[bot/messages] last_activity_at update failed:", error); });

      // AI agent: respond if bot is mentioned or respond_to_groups is enabled
      const config = await getAgentConfig();
      if (config) {
        const botInfo = bot.botInfo;
        const mentioned = isBotMentioned(
          messageText,
          ctx.message.entities as Array<{ type: string; offset: number; length: number; user?: { id: number } }>,
          botInfo.id,
          ctx.message.reply_to_message,
          botInfo.username
        );

        const shouldRespond =
          (config.respond_to_mentions && mentioned) ||
          (config.respond_to_groups && mentioned && !ctx.from.is_bot);

        if (shouldRespond && canRespondInGroup(chatId)) {
          const linkedDealId = deals?.[0]?.id;
          // Non-blocking: don't hold up message processing
          handleAIResponse(
            bot, chatId, ctx.from.id, senderName, messageText, messageId, linkedDealId
          ).catch((err) => console.error("[bot/ai-agent] group response error:", err));
        }
      }

      if (!deals || deals.length === 0) return; // No deals linked — skip notifications

      // Detect if sender is a team member
      const teamIds = await getTeamTelegramIds();
      const isTeamMember = teamIds.has(ctx.from.id);

      // Create a notification for each linked deal + push DM to assigned rep
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

        // Push DM to assigned rep (only if they're not the sender)
        if (deal.assigned_to) {
          // Check if sender IS the assigned rep (by telegram_id on profile)
          const { data: assignedProfile } = await supabase
            .from("profiles")
            .select("telegram_id")
            .eq("id", deal.assigned_to)
            .single();

          if (assignedProfile?.telegram_id && Number(assignedProfile.telegram_id) !== ctx.from.id) {
            sendTMAPush(bot, {
              userId: deal.assigned_to,
              triggerType: "tg_message",
              title: `💬 ${senderName} in ${tgGroup.group_name}`,
              body: messageText,
              tmaPath: `/tma/deals/${deal.id}`,
              dealId: deal.id,
            }).catch((err) => console.error("[bot/messages] push error:", err));
          }
        }

        // ── Highlight creation / clearing ──────────────────────────
        if (!ctx.from.is_bot) {
          if (isTeamMember) {
            // Team member responded — clear active highlights and record response time
            const { data: activeHighlights } = await supabase
              .from("crm_highlights")
              .select("id, created_at")
              .eq("deal_id", deal.id)
              .eq("is_active", true);

            if (activeHighlights && activeHighlights.length > 0) {
              const now = new Date();
              for (const h of activeHighlights) {
                const responseTimeMs = now.getTime() - new Date(h.created_at).getTime();
                await supabase
                  .from("crm_highlights")
                  .update({
                    is_active: false,
                    cleared_at: now.toISOString(),
                    cleared_by: "team_response",
                    responded_at: now.toISOString(),
                    response_time_ms: responseTimeMs,
                  })
                  .eq("id", h.id);
              }

              // Clear awaiting_response on the deal
              await supabase
                .from("crm_deals")
                .update({ awaiting_response_since: null })
                .eq("id", deal.id);
            }
          } else {
            // External sender — check for existing highlight dedup
            const { data: activeHighlights } = await supabase
              .from("crm_highlights")
              .select("id, sender_name")
              .eq("deal_id", deal.id)
              .eq("is_active", true);

            // If different sender responds, clear old highlights
            if (activeHighlights && activeHighlights.length > 0) {
              const fromDifferent = activeHighlights.some((h) => h.sender_name !== senderName);
              if (fromDifferent) {
                await supabase
                  .from("crm_highlights")
                  .update({ is_active: false, cleared_at: new Date().toISOString(), cleared_by: "response" })
                  .eq("deal_id", deal.id)
                  .eq("is_active", true);
              }
            }

            // Burst grouping: merge messages from same sender within 5 min into one highlight
            const BURST_WINDOW_MS = 5 * 60 * 1000;
            const burstCutoff = new Date(Date.now() - BURST_WINDOW_MS).toISOString();
            const { data: burstHighlight } = await supabase
              .from("crm_highlights")
              .select("id, message_count, message_preview, priority")
              .eq("deal_id", deal.id)
              .eq("sender_name", senderName)
              .eq("is_active", true)
              .gte("last_message_at", burstCutoff)
              .order("last_message_at", { ascending: false })
              .limit(1);

            if (burstHighlight && burstHighlight.length > 0) {
              // Merge into existing burst highlight — escalate priority if new message is higher
              const existing = burstHighlight[0];
              const newCount = (existing.message_count ?? 1) + 1;
              const preview = newCount <= 2
                ? `${existing.message_preview}\n${messageText.length > 80 ? messageText.slice(0, 80) + "..." : messageText}`
                : `${existing.message_preview.split("\n")[0]}\n+${newCount - 1} more messages`;

              // Re-evaluate priority/sentiment from latest message and escalate if higher
              const lowerText = messageText.toLowerCase();
              const urgentWords = ["urgent", "asap", "immediately", "critical", "deadline"];
              const highWords = ["ready to sign", "contract", "payment", "invoice", "approve", "confirm"];
              const negativeWords = ["cancel", "delay", "problem", "issue", "disappointed", "frustrated", "concerned"];

              const priorityRank: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
              let newPriority: string | undefined;
              if (urgentWords.some((w) => lowerText.includes(w))) newPriority = "urgent";
              else if (highWords.some((w) => lowerText.includes(w))) newPriority = "high";

              let newSentiment: string | undefined;
              if (negativeWords.some((w) => lowerText.includes(w))) newSentiment = "negative";

              const updatePayload: Record<string, unknown> = {
                message_count: newCount,
                message_preview: preview.slice(0, 200),
                last_message_at: new Date().toISOString(),
                tg_deep_link: tgDeepLink,
              };
              // Only escalate priority, never downgrade
              if (newPriority && (priorityRank[newPriority] ?? 0) > (priorityRank[existing.priority ?? "medium"] ?? 0)) {
                updatePayload.priority = newPriority;
              }
              // Negative sentiment overrides neutral/positive
              if (newSentiment === "negative") {
                updatePayload.sentiment = "negative";
              }

              await supabase
                .from("crm_highlights")
                .update(updatePayload)
                .eq("id", existing.id);
            } else {
              // Dedup: only create if no active highlight from this sender in 24h
              const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
              const { data: recentHighlight } = await supabase
                .from("crm_highlights")
                .select("id")
                .eq("deal_id", deal.id)
                .eq("sender_name", senderName)
                .eq("is_active", true)
                .gte("created_at", twentyFourHoursAgo)
                .limit(1);

              if (!recentHighlight || recentHighlight.length === 0) {
                // Priority / sentiment detection
                const lowerText = messageText.toLowerCase();
                const urgentWords = ["urgent", "asap", "immediately", "critical", "deadline"];
                const highWords = ["ready to sign", "contract", "payment", "invoice", "approve", "confirm"];
                const negativeWords = ["cancel", "delay", "problem", "issue", "disappointed", "frustrated", "concerned"];
                const positiveWords = ["excited", "great", "love", "perfect", "amazing", "deal", "agree", "yes"];

                let priority: "low" | "medium" | "high" | "urgent" = "medium";
                if (urgentWords.some((w) => lowerText.includes(w))) priority = "urgent";
                else if (highWords.some((w) => lowerText.includes(w))) priority = "high";

                let sentiment: "positive" | "neutral" | "negative" = "neutral";
                if (negativeWords.some((w) => lowerText.includes(w))) sentiment = "negative";
                else if (positiveWords.some((w) => lowerText.includes(w))) sentiment = "positive";

                await supabase.from("crm_highlights").insert({
                  deal_id: deal.id,
                  contact_id: deal.contact_id ?? null,
                  tg_group_id: tgGroup.id,
                  sender_name: senderName,
                  message_preview: messageText.length > 100 ? messageText.slice(0, 100) + "..." : messageText,
                  tg_deep_link: tgDeepLink,
                  highlight_type: "tg_message",
                  priority,
                  sentiment,
                  message_count: 1,
                  last_message_at: new Date().toISOString(),
                });

                // Set awaiting_response on the deal
                await supabase
                  .from("crm_deals")
                  .update({ awaiting_response_since: new Date().toISOString() })
                  .eq("id", deal.id);
              }
            }
          }
        }
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

          // Push notification: outreach reply detected
          // Find the sequence creator to notify them
          if (activeEnrollments.length > 0) {
            const { data: enrollmentDetails } = await supabase
              .from("crm_outreach_enrollments")
              .select("sequence_id, contact_id, deal_id")
              .eq("id", activeEnrollments[0].id)
              .single();

            if (enrollmentDetails?.sequence_id) {
              const { data: sequence } = await supabase
                .from("crm_outreach_sequences")
                .select("created_by, name")
                .eq("id", enrollmentDetails.sequence_id)
                .single();

              if (sequence?.created_by) {
                const contactPath = enrollmentDetails.contact_id
                  ? `/tma/contacts/${enrollmentDetails.contact_id}`
                  : enrollmentDetails.deal_id
                    ? `/tma/deals/${enrollmentDetails.deal_id}`
                    : "/tma/deals";

                sendTMAPush(bot, {
                  userId: sequence.created_by,
                  triggerType: "outreach_reply",
                  title: `↩️ Reply from ${senderName}`,
                  body: `Reply on "${sequence.name}": ${messageText}`,
                  tmaPath: contactPath,
                  dealId: enrollmentDetails.deal_id ?? undefined,
                }).catch((err) => console.error("[bot/messages] outreach reply push error:", err));
              }
            }
          }
        }
      } catch (replyErr) {
        console.error("[bot/messages] reply detection error:", replyErr);
      }

      // Check for active drip enrollments targeting this chat (reply detection)
      try {
        const { data: activeDripEnrollments } = await supabase
          .from("crm_drip_enrollments")
          .select("id")
          .eq("tg_chat_id", chatId)
          .eq("status", "active");

        if (activeDripEnrollments && activeDripEnrollments.length > 0) {
          for (const enrollment of activeDripEnrollments) {
            const { error: rpcErr } = await supabase.rpc("increment_drip_enrollment_reply", {
              p_enrollment_id: enrollment.id,
            });
            if (rpcErr) {
              console.error("[bot/messages] drip reply increment error:", rpcErr);
            }
          }
        }
      } catch (dripReplyErr) {
        console.error("[bot/messages] drip reply detection error:", dripReplyErr);
      }

      // Track reply hour for send-time optimization (non-blocking, atomic upsert)
      if (!isTeamMember && !ctx.from.is_bot) {
        const replyHour = new Date(ctx.message.date * 1000).getUTCHours();
        supabase.rpc("increment_reply_hour_stat", {
          p_tg_group_id: tgGroup.id,
          p_hour_utc: replyHour,
        }).then(() => {}); // Best effort
      }
    } catch (err) {
      console.error("[bot/messages] error:", err);
    }
  });
}
