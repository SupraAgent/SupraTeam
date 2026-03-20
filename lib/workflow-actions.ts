/**
 * Workflow action executors.
 * Each function handles one action node type, wrapping existing CRM infrastructure.
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramWithTracking } from "@/lib/telegram-send";
import { renderTemplate } from "@/lib/telegram-templates";
import { getDriverForUser } from "@/lib/email/driver";
import type {
  ActionSendTelegramConfig,
  ActionSendEmailConfig,
  ActionUpdateDealConfig,
  ActionCreateTaskConfig,
} from "@/lib/workflow-types";

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

  const message = renderTemplate(config.message || "{{deal_name}}", ctx.vars);

  const result = await sendTelegramWithTracking({
    chatId,
    text: message,
    notificationType: "workflow",
    dealId: ctx.dealId,
  });

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
