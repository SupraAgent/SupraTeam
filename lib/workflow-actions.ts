/**
 * Workflow action executors.
 * Each function handles one action node type, wrapping existing CRM infrastructure.
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramWithTracking } from "@/lib/telegram-send";
import { renderTemplate } from "@/lib/telegram-templates";
import { getDriverForUser } from "@/lib/email/driver";
// Config types are now simple Record<string, unknown> from the generic builder.
// We define local interfaces for type safety in the executor functions.
import { getSlackToken, sendSlackMessage } from "@/lib/slack";
import { checkTgRateLimit, recordTgMessage } from "@/lib/tg-rate-limit";

interface ActionSendTelegramConfig {
  message: string;
  chat_id?: string;
}

interface ActionSendEmailConfig {
  to?: string;
  subject: string;
  body: string;
  template_id?: string;
}

interface ActionSendSlackConfig {
  channel_id: string;
  channel_name?: string;
  message: string;
  mention_user_id?: string;
  mention_user_name?: string;
}

interface ActionUpdateDealConfig {
  field: string;
  value: string;
}

interface ActionUpdateContactConfig {
  field: string;
  value: string;
}

interface ActionAssignDealConfig {
  assign_to: string;
}

interface ActionAdvanceDealStageConfig {
  target_stage?: string;
  only_from_stage?: string;
}

interface ActionGenerateBookingLinkConfig {
  event_type_uri?: string;
  send_to_chat?: string;
  message_template?: string;
}

interface ActionCreateTaskConfig {
  title: string;
  description?: string;
  due_hours?: number;
}

export interface ActionContext {
  workflowId: string;
  runId: string;
  dealId?: string;
  contactId?: string;
  userId?: string; // created_by on the workflow
  vars: Record<string, string | number | undefined>; // template variables
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Execute a "send_telegram" action.
 * Sends to the deal's linked chat (or override chat_id).
 */
export async function executeSendTelegram(
  config: ActionSendTelegramConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  // Resolve chat ID
  let chatId = config.chat_id ? Number(config.chat_id) : null;

  if (!chatId && ctx.dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("telegram_chat_id")
      .eq("id", ctx.dealId)
      .single();
    chatId = deal?.telegram_chat_id ?? null;
  }

  if (!chatId) {
    return { success: false, error: "No chat ID available" };
  }

  // Check workflow-level rate limit before attempting send
  const botId = process.env.TELEGRAM_BOT_TOKEN?.slice(0, 10) || "default";
  const chatIdStr = String(chatId);
  const MAX_WAIT_MS = 5_000;

  let rl = checkTgRateLimit(botId, chatIdStr);
  if (!rl.allowed) {
    // Wait up to MAX_WAIT_MS then retry the check once
    const waitMs = Math.min(rl.retryAfterMs, MAX_WAIT_MS);
    await new Promise((r) => setTimeout(r, waitMs));
    rl = checkTgRateLimit(botId, chatIdStr);
    if (!rl.allowed) {
      return {
        success: false,
        error: `Telegram rate limit exceeded for chat ${chatId}. Retry after ${rl.retryAfterMs}ms`,
        output: { type: "rate_limit", retryAfterMs: rl.retryAfterMs },
      };
    }
  }

  const message = renderTemplate(config.message || "{{deal_name}}", ctx.vars);

  const result = await sendTelegramWithTracking({
    chatId,
    text: message,
    notificationType: "workflow",
    dealId: ctx.dealId,
  });

  // Record successful send for rate limit tracking
  if (result.success) {
    recordTgMessage(botId, chatIdStr);
  }

  return {
    success: result.success,
    output: { messageId: result.messageId },
    error: result.error,
  };
}

/**
 * Execute a "send_email" action.
 * Uses the workflow creator's email connection.
 */
export async function executeSendEmail(
  config: ActionSendEmailConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.userId) {
    return { success: false, error: "No user context for email" };
  }

  try {
    const { driver } = await getDriverForUser(ctx.userId);

    // Resolve recipient
    let to = config.to;
    if (!to && ctx.contactId) {
      const supabase = createSupabaseAdmin();
      if (supabase) {
        const { data: contact } = await supabase
          .from("crm_contacts")
          .select("email")
          .eq("id", ctx.contactId)
          .single();
        to = contact?.email ?? undefined;
      }
    }

    if (!to) {
      return { success: false, error: "No recipient email" };
    }

    const subject = renderTemplate(config.subject || "", ctx.vars);
    const body = renderTemplate(config.body || "", ctx.vars);

    const msg = await driver.send({
      to: [{ name: to, email: to }],
      subject,
      body,
    });

    return {
      success: true,
      output: { messageId: msg.id, to },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Execute a "send_slack" action.
 * Sends a message to a Slack channel with optional @mention.
 */
export async function executeSendSlack(
  config: ActionSendSlackConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const token = await getSlackToken();
  if (!token) {
    return { success: false, error: "Slack not connected — add token in Settings" };
  }

  if (!config.channel_id) {
    return { success: false, error: "No Slack channel selected" };
  }

  // Use shared renderTemplate for consistency (handles conditionals, filters, fallbacks)
  let message = renderTemplate(config.message || "{{message_text}}", ctx.vars);

  // Prepend @mention if configured
  if (config.mention_user_id) {
    message = `<@${config.mention_user_id}> ${message}`;
  }

  const result = await sendSlackMessage(token, config.channel_id, message);

  return {
    success: result.ok,
    output: { slackMessageTs: result.ts, channel: config.channel_id },
    error: result.error,
  };
}

/**
 * Execute an "update_deal" action.
 */
export async function executeUpdateDeal(
  config: ActionUpdateDealConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.dealId) {
    return { success: false, error: "No deal context" };
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const value = renderTemplate(config.value || "", ctx.vars);

  // Allowlist of safe fields to prevent arbitrary column writes
  const ALLOWED_FIELDS = ["deal_name", "value", "probability", "board_type", "notes", "priority", "assigned_to", "stage"];
  if (!ALLOWED_FIELDS.includes(config.field)) {
    return { success: false, error: `Invalid deal field: ${config.field}` };
  }

  // Handle stage changes specially — need to resolve stage ID
  if (config.field === "stage") {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("name", value)
      .single();

    if (!stage) {
      return { success: false, error: `Stage "${value}" not found` };
    }

    const { error } = await supabase
      .from("crm_deals")
      .update({ stage_id: stage.id })
      .eq("id", ctx.dealId);

    return error
      ? { success: false, error: error.message }
      : { success: true, output: { field: "stage", value } };
  }

  // Generic field update
  const { error } = await supabase
    .from("crm_deals")
    .update({ [config.field]: value })
    .eq("id", ctx.dealId);

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { field: config.field, value } };
}

/**
 * Execute a "create_task" action.
 * Creates a reminder/task linked to the deal.
 */
export async function executeCreateTask(
  config: ActionCreateTaskConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const title = renderTemplate(config.title || "Task", ctx.vars);
  const description = config.description
    ? renderTemplate(config.description, ctx.vars)
    : null;

  const dueHours = config.due_hours ?? 24;
  const dueAt = new Date(Date.now() + dueHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("crm_deal_reminders")
    .insert({
      deal_id: ctx.dealId || null,
      reminder_type: "follow_up",
      message: title + (description ? `\n${description}` : ""),
      due_at: dueAt,
    })
    .select("id")
    .single();

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { taskId: data?.id, title, dueAt } };
}

/**
 * Execute an "update_contact" action.
 * Updates a field on the deal's linked contact.
 */
export async function executeUpdateContact(
  config: ActionUpdateContactConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  // Resolve contact ID from deal if not in context
  let contactId = ctx.contactId;
  if (!contactId && ctx.dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("contact_id")
      .eq("id", ctx.dealId)
      .single();
    contactId = deal?.contact_id ?? undefined;
  }

  if (!contactId) {
    return { success: false, error: "No contact context" };
  }

  const value = renderTemplate(config.value || "", ctx.vars);
  const ALLOWED_FIELDS = ["company", "title", "phone", "email", "name"];
  if (!ALLOWED_FIELDS.includes(config.field)) {
    return { success: false, error: `Invalid contact field: ${config.field}` };
  }

  const { error } = await supabase
    .from("crm_contacts")
    .update({ [config.field]: value })
    .eq("id", contactId);

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { field: config.field, value, contactId } };
}

/**
 * Execute an "assign_deal" action.
 * Reassigns the deal to a different user.
 */
export async function executeAssignDeal(
  config: ActionAssignDealConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.dealId) {
    return { success: false, error: "No deal context" };
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const assignTo = renderTemplate(config.assign_to || "", ctx.vars);
  if (!assignTo) {
    return { success: false, error: "No assign_to specified" };
  }

  const { error } = await supabase
    .from("crm_deals")
    .update({ assigned_to: assignTo, updated_at: new Date().toISOString() })
    .eq("id", ctx.dealId);

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { assigned_to: assignTo } };
}

/**
 * Execute an "advance_deal_stage" action.
 * Moves deal to target stage or next stage in pipeline.
 */
export async function executeAdvanceDealStage(
  config: ActionAdvanceDealStageConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.dealId) {
    return { success: false, error: "No deal context" };
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const { data: deal } = await supabase
    .from("crm_deals")
    .select("id, stage_id, stage:pipeline_stages!inner(name, position, board_type)")
    .eq("id", ctx.dealId)
    .single();

  if (!deal) return { success: false, error: "Deal not found" };

  const currentStage = deal.stage as unknown as { name: string; position: number; board_type: string };

  // Guard: only advance from a specific stage
  if (config.only_from_stage && currentStage.name !== config.only_from_stage) {
    return { success: true, output: { skipped: true, reason: `Deal is in "${currentStage.name}", not "${config.only_from_stage}"` } };
  }

  let targetStageId: string | null = null;
  let targetStageName: string | null = null;

  if (config.target_stage) {
    // Explicit target stage
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id, name")
      .eq("name", config.target_stage)
      .eq("board_type", currentStage.board_type)
      .single();

    if (!stage) return { success: false, error: `Stage "${config.target_stage}" not found` };
    targetStageId = stage.id;
    targetStageName = stage.name;
  } else {
    // Next stage in pipeline
    const { data: nextStage } = await supabase
      .from("pipeline_stages")
      .select("id, name")
      .eq("board_type", currentStage.board_type)
      .gt("position", currentStage.position)
      .order("position")
      .limit(1)
      .single();

    if (!nextStage) return { success: true, output: { skipped: true, reason: "Already at final stage" } };
    targetStageId = nextStage.id;
    targetStageName = nextStage.name;
  }

  const { error } = await supabase
    .from("crm_deals")
    .update({
      stage_id: targetStageId,
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.dealId);

  if (error) return { success: false, error: error.message };

  // Log stage change history
  await supabase.from("crm_deal_stage_history").insert({
    deal_id: ctx.dealId,
    from_stage_id: deal.stage_id,
    to_stage_id: targetStageId,
    changed_by: ctx.userId ?? null,
  });

  // Log activity
  await supabase.from("crm_deal_activities").insert({
    deal_id: ctx.dealId,
    user_id: ctx.userId ?? null,
    activity_type: "stage_change",
    title: `Auto-advanced to ${targetStageName} (workflow)`,
    metadata: { from_stage: currentStage.name, to_stage: targetStageName, trigger: "workflow" },
  });

  return { success: true, output: { from_stage: currentStage.name, to_stage: targetStageName } };
}

/**
 * Execute a "generate_booking_link" action.
 * Creates a Calendly scheduling link and optionally sends it to the deal's TG chat.
 */
export async function executeGenerateBookingLink(
  config: ActionGenerateBookingLinkConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.dealId) return { success: false, error: "No deal context" };
  if (!ctx.userId) return { success: false, error: "No user context for Calendly" };

  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  try {
    const { getCalendlyEventTypes, createSchedulingLink } = await import("@/lib/calendly/client");

    // Resolve event type
    let eventTypeUri = config.event_type_uri;
    let eventTypeName = "Meeting";
    let eventTypeDuration: number | null = null;

    if (!eventTypeUri) {
      const eventTypes = await getCalendlyEventTypes(ctx.userId);
      if (eventTypes.length === 0) return { success: false, error: "No Calendly event types configured" };
      if (eventTypes.length === 1) {
        eventTypeUri = eventTypes[0].uri;
        eventTypeName = eventTypes[0].name;
        eventTypeDuration = eventTypes[0].duration;
      } else {
        return { success: false, error: "Multiple event types — specify event_type_uri in config" };
      }
    }

    const { booking_url } = await createSchedulingLink(ctx.userId, eventTypeUri);

    // Add UTM tracking
    const url = new URL(booking_url);
    url.searchParams.set("utm_source", "supracrm");
    url.searchParams.set("utm_campaign", ctx.dealId);
    if (ctx.contactId) url.searchParams.set("utm_content", ctx.contactId);
    const trackedUrl = url.toString();

    // Store booking link
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("contact_id, telegram_chat_id")
      .eq("id", ctx.dealId)
      .single();

    await supabase.from("crm_booking_links").insert({
      user_id: ctx.userId,
      deal_id: ctx.dealId,
      contact_id: deal?.contact_id || ctx.contactId || null,
      calendly_event_type_uri: eventTypeUri,
      calendly_event_type_name: eventTypeName,
      calendly_event_type_duration: eventTypeDuration,
      calendly_scheduling_link: trackedUrl,
      utm_params: { utm_source: "supracrm", utm_campaign: ctx.dealId },
      status: "pending",
    });

    // Optionally send to TG chat
    if (config.send_to_chat === "true" && deal?.telegram_chat_id) {
      const messageTemplate = config.message_template || "📅 Book a call: {{booking_url}}";
      const message = renderTemplate(messageTemplate, { ...ctx.vars, booking_url: trackedUrl, event_type: eventTypeName });

      await sendTelegramWithTracking({
        chatId: deal.telegram_chat_id,
        text: message,
        notificationType: "workflow",
        dealId: ctx.dealId,
      });
    }

    // Log activity
    await supabase.from("crm_deal_activities").insert({
      deal_id: ctx.dealId,
      user_id: ctx.userId,
      activity_type: "booking_link_sent",
      title: `Booking link generated: ${eventTypeName} (workflow)`,
      metadata: { event_type: eventTypeName, source: "workflow" },
    });

    return { success: true, output: { booking_url: trackedUrl, event_type: eventTypeName } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to generate booking link" };
  }
}

// ── New action executors (wiring palette nodes to engine) ───────

interface ActionCreateDealConfig {
  deal_name: string;
  board_type?: string;
  stage_name?: string;
}

export async function executeCreateDeal(
  config: ActionCreateDealConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const dealName = renderTemplate(config.deal_name || "New Deal", ctx.vars);
  const boardType = config.board_type || "BD";

  let stageId: string | null = null;
  if (config.stage_name) {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("name", config.stage_name)
      .limit(1)
      .single();
    stageId = stage?.id ?? null;
  }
  if (!stageId) {
    const { data: firstStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .order("position")
      .limit(1)
      .single();
    stageId = firstStage?.id ?? null;
  }

  const { data, error } = await supabase
    .from("crm_deals")
    .insert({
      deal_name: dealName,
      board_type: boardType,
      stage_id: stageId,
      contact_id: ctx.contactId || null,
      created_by: ctx.userId || null,
    })
    .select("id")
    .single();

  return error
    ? { success: false, error: error.message }
    : { success: true, output: { dealId: data?.id, deal_name: dealName } };
}

interface ActionSendBroadcastConfig {
  message: string;
  slug?: string;
}

export async function executeSendBroadcast(
  config: ActionSendBroadcastConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  const message = renderTemplate(config.message || "", ctx.vars);
  if (!message) return { success: false, error: "No broadcast message" };

  // Get target groups by slug or all groups
  let query = supabase.from("tg_groups").select("telegram_group_id, group_name").eq("is_archived", false);
  if (config.slug) {
    const { data: slugGroups } = await supabase
      .from("tg_group_slugs")
      .select("group_id")
      .eq("slug", config.slug);
    const groupIds = (slugGroups ?? []).map((s) => s.group_id);
    if (groupIds.length === 0) return { success: false, error: `No groups with slug "${config.slug}"` };
    query = query.in("id", groupIds);
  }

  const { data: groups } = await query;
  if (!groups || groups.length === 0) return { success: false, error: "No target groups found" };

  let sent = 0;
  for (const group of groups) {
    const result = await sendTelegramWithTracking({
      chatId: Number(group.telegram_group_id),
      text: message,
      notificationType: "broadcast",
    });
    if (result.success) sent++;
  }

  return { success: true, output: { sent, total: groups.length } };
}

interface ActionHttpRequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function executeHttpRequest(
  config: ActionHttpRequestConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const url = renderTemplate(config.url || "", ctx.vars);
  if (!url) return { success: false, error: "No URL specified" };

  // SSRF protection: strict URL allowlist — only HTTPS to public hosts
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return { success: false, error: "Only HTTPS URLs are allowed" };
    }
    const hostname = parsed.hostname.toLowerCase();
    // Block localhost, loopback, private ranges, link-local, metadata endpoints
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      hostname === "metadata.google.internal" ||
      hostname === "[::1]" ||
      /^\[fe80:/i.test(hostname) ||
      /^\[fd/i.test(hostname) ||
      /^\[fc/i.test(hostname) ||
      /^0\./.test(hostname)
    ) {
      return { success: false, error: "Private/internal network URLs are not allowed" };
    }
  } catch {
    return { success: false, error: "Invalid URL" };
  }

  try {
    const method = config.method?.toUpperCase() || "GET";
    const body = config.body ? renderTemplate(config.body, ctx.vars) : undefined;
    // Header allowlist — only safe headers can be set by workflow config
    const ALLOWED_HEADERS = new Set([
      "accept", "content-type", "authorization", "x-api-key",
      "x-request-id", "user-agent", "x-correlation-id",
    ]);
    const safeHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (config.headers) {
      for (const [k, v] of Object.entries(config.headers)) {
        if (ALLOWED_HEADERS.has(k.toLowerCase())) {
          safeHeaders[k] = v;
        }
      }
    }
    const res = await fetch(url, {
      method,
      headers: safeHeaders,
      body: method !== "GET" ? body : undefined,
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await res.text().catch(() => "");
    let responseJson: unknown = null;
    try { responseJson = JSON.parse(responseText); } catch { /* not JSON */ }

    return {
      success: res.ok,
      output: { status: res.status, body: responseJson ?? responseText },
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "HTTP request failed" };
  }
}

interface ActionAiSummarizeConfig {
  prompt?: string;
}

export async function executeAiSummarize(
  config: ActionAiSummarizeConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  if (!ctx.dealId) return { success: false, error: "No deal context for AI summarize" };

  try {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("deal_name, telegram_chat_id")
      .eq("id", ctx.dealId)
      .single();

    if (!deal?.telegram_chat_id) return { success: false, error: "No TG chat linked to deal" };

    const { data: messages } = await supabase
      .from("tg_messages")
      .select("sender_name, message_text, sent_at")
      .eq("telegram_chat_id", deal.telegram_chat_id)
      .order("sent_at", { ascending: false })
      .limit(30);

    const context = (messages ?? []).reverse()
      .map((m) => `${m.sender_name}: ${m.message_text ?? "(media)"}`)
      .join("\n");

    const prompt = config.prompt
      ? renderTemplate(config.prompt, { ...ctx.vars, conversation: context })
      : `Summarize this conversation concisely (3-5 bullet points):\n\n${context}`;

    // Use internal AI endpoint with service auth
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"}/api/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? { "x-service-key": process.env.SUPABASE_SERVICE_ROLE_KEY } : {}),
      },
      body: JSON.stringify({ message: prompt, context: `Deal: ${deal.deal_name}` }),
    });

    if (!res.ok) return { success: false, error: "AI summarize request failed" };
    const data = await res.json();
    const summary = data.reply ?? data.message ?? "";

    // Store summary on deal
    await supabase.from("crm_deals").update({
      ai_summary: summary,
      ai_summary_at: new Date().toISOString(),
    }).eq("id", ctx.dealId);

    return { success: true, output: { summary } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "AI summarize failed" };
  }
}

interface ActionAiClassifyConfig {
  categories: string[];
  field?: string;
}

export async function executeAiClassify(
  config: ActionAiClassifyConfig,
  ctx: ActionContext
): Promise<ActionResult> {
  if (!ctx.dealId && !ctx.contactId) return { success: false, error: "No deal or contact context" };

  const categories = config.categories ?? ["hot_lead", "warm_lead", "cold_lead", "not_qualified"];
  const prompt = `Classify this into exactly one category: ${categories.join(", ")}. Reply with ONLY the category name.\n\nContext: Deal "${ctx.vars.deal_name ?? "unknown"}" at stage "${ctx.vars.stage ?? "unknown"}" with contact "${ctx.vars.contact_name ?? "unknown"}"`;

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"}/api/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? { "x-service-key": process.env.SUPABASE_SERVICE_ROLE_KEY } : {}),
      },
      body: JSON.stringify({ message: prompt, context: "classification" }),
    });
    if (!res.ok) return { success: false, error: "AI classify failed" };
    const data = await res.json();
    const classification = (data.reply ?? data.message ?? "").trim().toLowerCase();

    return { success: true, output: { classification, matched: categories.includes(classification) } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "AI classify failed" };
  }
}
