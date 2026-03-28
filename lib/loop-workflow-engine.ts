/**
 * Loop Builder server-side execution engine.
 *
 * Translates Loop Builder CRM node types (crmTriggerNode, crmActionNode,
 * crmConditionNode) into the generic engine types (trigger, action, condition),
 * then delegates to the existing @supra/automation-builder engine.
 *
 * Zero duplication — all execution, persistence, template rendering, and
 * action dispatching reuse the existing infrastructure in workflow-engine.ts.
 */
import {
  executeWorkflow as genericExecuteWorkflow,
  resumeWorkflow as genericResumeWorkflow,
  type EngineConfig,
  type ActionContext,
  type ActionResult,
  type WorkflowData,
  type FlowNode,
  type FlowEdge,
  type WorkflowEvent,
} from "@supra/automation-builder";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createSupabasePersistence } from "@/lib/workflow-persistence";
import { renderTemplate } from "@/lib/telegram-templates";
import {
  executeSendTelegram,
  executeSendEmail,
  executeSendSlack,
  executeUpdateDeal,
  executeUpdateContact,
  executeAssignDeal,
  executeCreateTask,
} from "@/lib/workflow-actions";
import type { Workflow } from "@/lib/workflow-db-types";

// Re-export for consumers
export type { Workflow } from "@/lib/workflow-db-types";

export interface LoopWorkflowEvent {
  type: string;
  dealId?: string;
  contactId?: string;
  payload: Record<string, unknown>;
}

// ── Node Type Translation ───────────────────────────────────

/**
 * Translate Loop Builder nodes into generic engine node types.
 * crmTriggerNode → trigger, crmActionNode → action, crmConditionNode → condition
 * Leaves non-CRM nodes (delayNode, etc.) unchanged.
 */
function translateNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => {
    const data = node.data as unknown as Record<string, unknown>;

    if (node.type === "crmTriggerNode") {
      return {
        ...node,
        type: "trigger",
        data: {
          nodeType: "trigger",
          triggerType: (data.crmTrigger as string) || "manual",
          label: (data.label as string) || "CRM Trigger",
          config: (data.config as Record<string, unknown>) ?? {},
        },
      } as FlowNode;
    }

    if (node.type === "crmActionNode") {
      return {
        ...node,
        type: "action",
        data: {
          nodeType: "action",
          actionType: (data.crmAction as string) || "update_deal",
          label: (data.label as string) || "CRM Action",
          config: (data.config as Record<string, unknown>) ?? {},
        },
      } as FlowNode;
    }

    if (node.type === "crmConditionNode") {
      return {
        ...node,
        type: "condition",
        data: {
          nodeType: "condition",
          label: (data.label as string) || "CRM Condition",
          config: {
            field: (data.field as string) || "stage",
            operator: (data.operator as string) || "equals",
            value: (data.value as string) || "",
          },
        },
      } as FlowNode;
    }

    // Non-CRM nodes (delay, etc.) pass through unchanged
    return node;
  });
}

/**
 * Translate Loop Builder edges — remap sourceHandles from
 * "true"/"false" (CRM condition convention) to the generic engine's convention.
 */
function translateEdges(edges: FlowEdge[]): FlowEdge[] {
  // The generic engine uses the same "true"/"false" handle convention,
  // so edges pass through unchanged.
  return edges;
}

// ── Action Executor ─────────────────────────────────────────

/**
 * CRM action executor for Loop Builder workflows.
 * Dispatches to existing action executors in workflow-actions.ts.
 * Extended actions (broadcast, AI, sequences, HTTP) are handled inline.
 */
async function loopActionExecutor(
  actionType: string,
  config: Record<string, unknown>,
  ctx: ActionContext
): Promise<ActionResult> {
  const coercedVars: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(ctx.vars)) {
    if (v == null) coercedVars[k] = undefined;
    else if (typeof v === "string" || typeof v === "number") coercedVars[k] = v;
    else coercedVars[k] = String(v);
  }
  const crmCtx: import("@/lib/workflow-actions").ActionContext = {
    workflowId: ctx.workflowId,
    runId: ctx.runId,
    dealId: ctx.dealId as string | undefined,
    contactId: ctx.contactId as string | undefined,
    userId: ctx.userId as string | undefined,
    vars: coercedVars,
  };

  const cfg = config as Record<string, string>;

  switch (actionType) {
    case "send_telegram":
      return executeSendTelegram({ message: cfg.message || "", chat_id: cfg.chat_id }, crmCtx);
    case "send_email":
      return executeSendEmail({ to: cfg.to, subject: cfg.subject || "", body: cfg.body || "" }, crmCtx);
    case "send_slack":
      return executeSendSlack({ channel_id: cfg.channel_id || "", message: cfg.message || "" }, crmCtx);
    case "update_deal":
      return executeUpdateDeal({ field: cfg.field || "", value: cfg.value || "" }, crmCtx);
    case "update_contact":
      return executeUpdateContact({ field: cfg.field || "", value: cfg.value || "" }, crmCtx);
    case "assign_deal":
      return executeAssignDeal({ assign_to: cfg.assign_to || "" }, crmCtx);
    case "create_task":
      return executeCreateTask({
        title: cfg.title || "",
        description: cfg.description,
        due_hours: cfg.due_hours ? Number(cfg.due_hours) : undefined,
      }, crmCtx);
    default:
      // Extended actions: create_deal, tags, broadcast, AI, sequences, HTTP, TG access
      return executeExtendedAction(actionType, cfg, crmCtx);
  }
}

/** Handle extended CRM actions that don't have dedicated executor functions */
async function executeExtendedAction(
  actionType: string,
  config: Record<string, string>,
  ctx: import("@/lib/workflow-actions").ActionContext
): Promise<ActionResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  switch (actionType) {
    case "create_deal": {
      const { data, error } = await supabase.from("crm_deals").insert({
        deal_name: config.name || "New Deal",
        board_type: config.board_type || "BD",
        stage_id: config.stage_id || undefined,
        value: config.value ? Number(config.value) : null,
        assigned_to: config.assign_to || ctx.userId,
        created_by: ctx.userId,
      }).select().single();
      return error ? { success: false, error: error.message } : { success: true, output: { deal: data } };
    }

    case "add_tag": {
      if (!config.tag || !ctx.dealId) return { success: false, error: "tag and dealId required" };
      const { data: deal } = await supabase.from("crm_deals").select("tags").eq("id", ctx.dealId).single();
      const tags: string[] = Array.isArray(deal?.tags) ? deal.tags : [];
      if (!tags.includes(config.tag)) tags.push(config.tag);
      const { error } = await supabase.from("crm_deals").update({ tags }).eq("id", ctx.dealId);
      return error ? { success: false, error: error.message } : { success: true, output: { tags } };
    }

    case "remove_tag": {
      if (!config.tag || !ctx.dealId) return { success: false, error: "tag and dealId required" };
      const { data: deal } = await supabase.from("crm_deals").select("tags").eq("id", ctx.dealId).single();
      const tags: string[] = (Array.isArray(deal?.tags) ? deal.tags : []).filter((t: string) => t !== config.tag);
      const { error } = await supabase.from("crm_deals").update({ tags }).eq("id", ctx.dealId);
      return error ? { success: false, error: error.message } : { success: true, output: { tags } };
    }

    case "send_broadcast": {
      if (!config.message) return { success: false, error: "message required" };
      const slug = config.slug;
      if (!slug) return { success: false, error: "slug required for broadcast" };
      const { data: slugGroups } = await supabase
        .from("tg_group_slugs")
        .select("group_id, tg_groups(telegram_group_id)")
        .eq("slug", slug);
      const groupIds = (slugGroups ?? [])
        .map((sg) => { const g = Array.isArray(sg.tg_groups) ? sg.tg_groups[0] : sg.tg_groups; return g?.telegram_group_id; })
        .filter(Boolean) as string[];
      if (groupIds.length === 0) return { success: false, error: "No groups for slug" };
      let sent = 0;
      for (const gid of groupIds) {
        const r = await executeSendTelegram({ message: config.message, chat_id: gid }, ctx);
        if (r.success) sent++;
      }
      return { success: sent > 0, output: { sent, total: groupIds.length } };
    }

    case "http_request": {
      if (!config.url) return { success: false, error: "url required" };
      try {
        const parsed = new URL(config.url);
        if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))) {
          return { success: false, error: "Only HTTPS allowed (except localhost)" };
        }
      } catch { return { success: false, error: "Invalid URL" }; }
      const method = (config.method || "GET").toUpperCase();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(config.url, {
          method,
          headers: { "Content-Type": "application/json", ...(config.auth_header ? { Authorization: config.auth_header } : {}) },
          body: method !== "GET" && config.body ? config.body : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const text = await res.text();
        return { success: res.ok, output: { status: res.status, body: text.slice(0, 5000) }, error: res.ok ? undefined : `HTTP ${res.status}` };
      } catch (e) {
        clearTimeout(timeout);
        return { success: false, error: e instanceof Error ? e.message : "HTTP request failed" };
      }
    }

    default:
      return { success: false, error: `Unhandled action type: ${actionType}` };
  }
}

// ── Build Template Vars (reuses same logic as old engine) ───

async function buildVars(
  event: LoopWorkflowEvent,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>
): Promise<Record<string, string | number | undefined>> {
  const vars: Record<string, string | number | undefined> = {
    ...Object.fromEntries(
      Object.entries(event.payload).map(([k, v]) => [k, v == null ? undefined : String(v)])
    ),
  };
  if (event.dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("*, stage:pipeline_stages(name), contact:crm_contacts(name, email, company)")
      .eq("id", event.dealId)
      .single();
    if (deal) {
      vars.deal_name = deal.deal_name as string;
      vars.board_type = (deal.board_type as string) ?? "Unknown";
      vars.stage = (deal.stage as { name: string } | null)?.name ?? "Unknown";
      vars.value = deal.value as number | undefined;
      vars.company = (deal.contact as { company?: string } | null)?.company;
      vars.contact_name = (deal.contact as { name?: string } | null)?.name;
      vars.contact_email = (deal.contact as { email?: string } | null)?.email;
    }
  }
  return vars;
}

// ── Engine Config ───────────────────────────────────────────

function createDryRunPersistence() {
  return {
    createRun: async () => `dry-run-${Date.now()}`,
    updateRun: async () => {},
    scheduleResume: async () => {},
    onWorkflowComplete: async () => {},
  };
}

function getEngineConfig(dryRun = false): EngineConfig {
  return {
    executeAction: loopActionExecutor,
    persistence: dryRun ? createDryRunPersistence() : createSupabasePersistence(),
    renderTemplate: (template, vars) => renderTemplate(template, vars),
  };
}

// ── Execution Timeout Wrapper ───────────────────────────────

const EXECUTION_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// ── Failure Alerts ──────────────────────────────────────────

/**
 * Log a workflow failure alert to crm_notification_log.
 * This creates a visible record that can be surfaced in the UI and
 * optionally triggers Telegram/email alerts to admins.
 */
async function logWorkflowFailureAlert(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  workflowId: string,
  workflowName: string,
  runId: string,
  error: string
) {
  try {
    await supabase.from("crm_notification_log").insert({
      notification_type: "workflow_failure",
      status: "sent",
      message_preview: `Workflow "${workflowName}" failed: ${error.slice(0, 180)}`,
      tg_chat_id: 0,
      automation_rule_id: workflowId,
      sent_at: new Date().toISOString(),
    });
  } catch {
    // Don't let alert logging break execution
    console.error(`Failed to log workflow failure alert for ${runId}`);
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Execute a Loop Builder workflow by ID.
 * Translates CRM node types → generic types, then delegates to genericExecuteWorkflow.
 */
export async function executeLoopWorkflow(
  workflowId: string,
  event: LoopWorkflowEvent
) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId: "", status: "failed" as const, nodeOutputs: {}, nodeTimings: {}, error: "Supabase not configured" };
  }

  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!workflow) {
    return { runId: "", status: "failed" as const, nodeOutputs: {}, nodeTimings: {}, error: "Workflow not found" };
  }

  const rawNodes = (workflow.nodes ?? []) as FlowNode[];
  const rawEdges = (workflow.edges ?? []) as FlowEdge[];
  const vars = await buildVars(event, supabase);

  const workflowData: WorkflowData = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: translateNodes(rawNodes),
    edges: translateEdges(rawEdges),
    is_active: workflow.is_active,
    trigger_type: workflow.trigger_type,
  };

  const result = await withTimeout(
    genericExecuteWorkflow(workflowData, event, {
      vars,
      dealId: event.dealId,
      contactId: event.contactId,
      userId: (workflow as unknown as Workflow).created_by ?? undefined,
    }, getEngineConfig()),
    EXECUTION_TIMEOUT_MS,
    `Workflow ${workflowId}`
  );

  // Log failure alert for monitoring
  if (result.status === "failed" && result.error) {
    await logWorkflowFailureAlert(supabase, workflowId, workflow.name, result.runId, result.error);
  }

  return result;
}

/**
 * Execute a Loop Builder workflow in dry-run mode.
 */
export async function executeLoopWorkflowDryRun(
  workflowId: string,
  event: LoopWorkflowEvent
) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId: "", status: "failed" as const, nodeOutputs: {}, error: "Supabase not configured" };
  }

  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!workflow) {
    return { runId: "", status: "failed" as const, nodeOutputs: {}, error: "Workflow not found" };
  }

  const rawNodes = (workflow.nodes ?? []) as FlowNode[];
  const rawEdges = (workflow.edges ?? []) as FlowEdge[];
  const vars = await buildVars(event, supabase);

  const workflowData: WorkflowData = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: translateNodes(rawNodes),
    edges: translateEdges(rawEdges),
    is_active: workflow.is_active,
    trigger_type: workflow.trigger_type,
  };

  return genericExecuteWorkflow(workflowData, event, {
    vars,
    dealId: event.dealId,
    contactId: event.contactId,
    userId: (workflow as unknown as Workflow).created_by ?? undefined,
  }, getEngineConfig(true));
}

/**
 * Resume a paused Loop Builder workflow run (after delay expires).
 */
export async function resumeLoopWorkflowRun(runId: string) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId, status: "failed" as const, nodeOutputs: {}, nodeTimings: {}, error: "Supabase not configured" };
  }

  const { data: run } = await supabase
    .from("crm_workflow_runs")
    .select("*, workflow:crm_workflows(*)")
    .eq("id", runId)
    .single();

  if (!run || run.status !== "paused") {
    return { runId, status: "failed" as const, nodeOutputs: {}, nodeTimings: {}, error: "Run not found or not paused" };
  }

  const workflow = run.workflow as unknown as Workflow;
  const nodeOutputs = (run.node_outputs ?? {}) as Record<string, unknown>;
  const resumeTargets = (nodeOutputs._resume_targets ?? []) as string[];
  const triggerEvent = (run.trigger_event ?? {}) as LoopWorkflowEvent;

  if (resumeTargets.length === 0) {
    await supabase.from("crm_workflow_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      node_outputs: nodeOutputs,
    }).eq("id", runId);
    return { runId, status: "completed" as const, nodeOutputs, nodeTimings: {} };
  }

  const rawNodes = (workflow.nodes ?? []) as FlowNode[];
  const rawEdges = (workflow.edges ?? []) as FlowEdge[];
  const vars = await buildVars(triggerEvent, supabase);

  const workflowData: WorkflowData = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: translateNodes(rawNodes),
    edges: translateEdges(rawEdges),
    is_active: workflow.is_active,
    trigger_type: workflow.trigger_type,
  };

  return genericResumeWorkflow(
    workflowData, runId, resumeTargets, nodeOutputs, triggerEvent,
    { vars, dealId: triggerEvent.dealId, contactId: triggerEvent.contactId, userId: workflow.created_by ?? undefined },
    getEngineConfig()
  );
}

/**
 * Check if a workflow is a Loop Builder workflow (has crmTriggerNode nodes).
 */
export function isLoopBuilderWorkflow(nodes: unknown[]): boolean {
  return (nodes as FlowNode[]).some((n) => n.type === "crmTriggerNode");
}

/**
 * Find and execute all active Loop Builder workflows matching a trigger type.
 */
export async function triggerLoopWorkflowsByEvent(
  triggerType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;

  const { data: workflows } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("is_active", true)
    .eq("trigger_type", triggerType);

  if (!workflows || workflows.length === 0) return;

  // Filter to Loop Builder workflows only
  const loopWorkflows = workflows.filter((wf) => isLoopBuilderWorkflow(wf.nodes ?? []));
  if (loopWorkflows.length === 0) return;

  const BATCH_SIZE = 5;
  for (let i = 0; i < loopWorkflows.length; i += BATCH_SIZE) {
    const batch = loopWorkflows.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (wf) => {
        const nodes = (wf.nodes ?? []) as FlowNode[];
        const triggerNode = nodes.find((n) => n.type === "crmTriggerNode");
        if (!triggerNode) return;

        // Match trigger config against payload
        const triggerData = triggerNode.data as unknown as Record<string, unknown>;
        const triggerConfig = (triggerData.config ?? {}) as Record<string, string>;

        if (triggerType === "deal_stage_change" && triggerConfig.stage_name) {
          if (triggerConfig.stage_name !== payload.to_stage_name) return;
        }
        if (triggerType === "tg_message" && triggerConfig.group_id) {
          if (String(triggerConfig.group_id) !== String(payload.chat_id)) return;
        }
        if (triggerType === "deal_created" && triggerConfig.board_type) {
          if (triggerConfig.board_type !== payload.board_type) return;
        }

        const event: LoopWorkflowEvent = {
          type: triggerType,
          dealId: payload.deal_id as string | undefined,
          contactId: payload.contact_id as string | undefined,
          payload,
        };

        return executeLoopWorkflow(wf.id, event).catch((err) => {
          console.error(`[loop-workflow-engine] Error executing workflow ${wf.id}:`, err);
        });
      })
    );
  }
}
