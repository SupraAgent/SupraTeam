/**
 * Automation rule engine.
 * Evaluates trigger-condition-action rules against CRM events.
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { sendTelegramWithTracking } from "@/lib/telegram-send";
import { renderTemplate } from "@/lib/telegram-templates";

export interface AutomationEvent {
  type: "stage_change" | "deal_created" | "deal_value_change" | "tag_added";
  dealId: string;
  payload: Record<string, unknown>;
}

/**
 * Evaluate all active automation rules against an event.
 * Returns count of actions executed.
 */
export async function evaluateAutomationRules(event: AutomationEvent): Promise<number> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return 0;

  const { data: rules } = await supabase
    .from("crm_automation_rules")
    .select("*")
    .eq("trigger_type", event.type)
    .eq("is_active", true);

  if (!rules || rules.length === 0) return 0;

  // Fetch deal data for template rendering
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("*, stage:pipeline_stages(name)")
    .eq("id", event.dealId)
    .single();

  if (!deal) return 0;

  let executed = 0;

  for (const rule of rules) {
    // Check trigger config matches
    if (!matchesTrigger(rule.trigger_config, event)) continue;

    // Check condition config matches
    if (!matchesCondition(rule.condition_config, deal)) continue;

    // Execute action
    const success = await executeAction(rule, deal, event, supabase);
    if (success) executed++;

    // Log execution (non-critical)
    try {
      await supabase.from("crm_automation_log").insert({
        rule_id: rule.id,
        deal_id: event.dealId,
        trigger_type: event.type,
        action_type: rule.action_type,
        success,
      });
    } catch {
      // Don't fail on log error
    }
  }

  return executed;
}

function matchesTrigger(
  config: Record<string, unknown> | null,
  event: AutomationEvent
): boolean {
  if (!config || Object.keys(config).length === 0) return true;

  for (const [key, value] of Object.entries(config)) {
    if (key === "to_stage" && event.payload.to_stage_name !== value) return false;
    if (key === "from_stage" && event.payload.from_stage_name !== value) return false;
    if (key === "value_gte" && Number(event.payload.value ?? 0) < Number(value)) return false;
    if (key === "value_lte" && Number(event.payload.value ?? 0) > Number(value)) return false;
    if (key === "tag" && event.payload.tag !== value) return false;
  }
  return true;
}

function matchesCondition(
  config: Record<string, unknown> | null,
  deal: Record<string, unknown>
): boolean {
  if (!config || Object.keys(config).length === 0) return true;

  for (const [key, value] of Object.entries(config)) {
    if (key === "board_type" && deal.board_type !== value) return false;
  }
  return true;
}

async function executeAction(
  rule: Record<string, unknown>,
  deal: Record<string, unknown>,
  event: AutomationEvent,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>
): Promise<boolean> {
  const actionType = rule.action_type as string;
  const actionConfig = (rule.action_config ?? {}) as Record<string, unknown>;
  const chatId = deal.telegram_chat_id as number | null;

  if (!chatId && (actionType === "send_telegram" || actionType === "schedule_message")) {
    return false; // No chat to send to
  }

  const stageName = (deal.stage as { name: string } | null)?.name ?? "Unknown";

  // Build template variables from deal + event data
  const vars: Record<string, string | number | undefined> = {
    deal_name: deal.deal_name as string,
    board_type: (deal.board_type as string) ?? "Unknown",
    stage: stageName,
    value: deal.value as number | undefined,
    ...Object.fromEntries(
      Object.entries(event.payload).map(([k, v]) => [k, String(v)])
    ),
  };

  if (actionType === "send_telegram") {
    const messageTemplate = (actionConfig.message as string) ?? "Automation: {{deal_name}} triggered rule";
    const message = renderTemplate(messageTemplate, vars);

    const result = await sendTelegramWithTracking({
      chatId: chatId!,
      text: message,
      notificationType: "automation",
      dealId: event.dealId,
      automationRuleId: rule.id as string,
    });
    return result.success;
  }

  if (actionType === "schedule_message") {
    const delayHours = Number(actionConfig.delay_hours ?? 24);
    const messageTemplate = (actionConfig.message as string) ?? "Follow up: {{deal_name}}";
    const message = renderTemplate(messageTemplate, vars);
    const sendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("crm_scheduled_messages").insert({
      deal_id: event.dealId,
      tg_chat_id: chatId!,
      message_text: message,
      send_at: sendAt,
      automation_rule_id: rule.id as string,
    });
    return !error;
  }

  if (actionType === "create_reminder") {
    const delayHours = Number(actionConfig.delay_hours ?? 24);
    const message = renderTemplate(
      (actionConfig.title as string) ?? (actionConfig.message as string) ?? "Follow up on {{deal_name}}",
      vars
    );
    const dueAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("crm_deal_reminders").insert({
      deal_id: event.dealId,
      reminder_type: "follow_up",
      message,
      due_at: dueAt,
    });
    return !error;
  }

  return false;
}
