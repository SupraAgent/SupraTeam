/**
 * CRM workflow engine — wraps @supra/automation-builder's generic engine
 * with Supabase persistence and CRM-specific action executors.
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
} from "@supra/automation-builder";
import { createSupabaseAdmin } from "@/lib/supabase";
import { createSupabasePersistence } from "@/lib/workflow-persistence";
import { renderTemplate } from "@/lib/telegram-templates";
import {
  executeSendTelegram,
  executeSendEmail,
  executeUpdateDeal,
  executeUpdateContact,
  executeAssignDeal,
  executeCreateTask,
} from "@/lib/workflow-actions";
import type { Workflow } from "@/lib/workflow-db-types";

// Re-export for API route consumers
export type { Workflow } from "@/lib/workflow-db-types";
export type { WorkflowEvent, RunResult } from "@supra/automation-builder";

/**
 * CRM action executor — dispatches to existing action functions.
 */
async function crmActionExecutor(
  actionType: string,
  config: Record<string, unknown>,
  ctx: ActionContext
): Promise<ActionResult> {
  // Build CRM-compatible context from generic context
  const crmCtx = {
    workflowId: ctx.workflowId,
    runId: ctx.runId,
    dealId: ctx.dealId as string | undefined,
    contactId: ctx.contactId as string | undefined,
    userId: ctx.userId as string | undefined,
    vars: ctx.vars,
  };

  switch (actionType) {
    case "send_telegram":
      return executeSendTelegram(config as unknown as Parameters<typeof executeSendTelegram>[0], crmCtx);
    case "send_email":
      return executeSendEmail(config as unknown as Parameters<typeof executeSendEmail>[0], crmCtx);
    case "update_deal":
      return executeUpdateDeal(config as unknown as Parameters<typeof executeUpdateDeal>[0], crmCtx);
    case "update_contact":
      return executeUpdateContact(config as unknown as Parameters<typeof executeUpdateContact>[0], crmCtx);
    case "assign_deal":
      return executeAssignDeal(config as unknown as Parameters<typeof executeAssignDeal>[0], crmCtx);
    case "create_task":
      return executeCreateTask(config as unknown as Parameters<typeof executeCreateTask>[0], crmCtx);
    default:
      return { success: false, error: `Unknown action type: ${actionType}` };
  }
}

function getEngineConfig(): EngineConfig {
  return {
    executeAction: crmActionExecutor,
    persistence: createSupabasePersistence(),
    renderTemplate: (template, vars) => renderTemplate(template, vars),
  };
}

/**
 * Build template vars from deal/contact data.
 */
async function buildVars(
  event: { dealId?: string; contactId?: string; payload: Record<string, unknown> },
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

// ── Public API (same function signatures as before) ─────────────

export interface CrmWorkflowEvent {
  type: string;
  dealId?: string;
  contactId?: string;
  payload: Record<string, unknown>;
}

/**
 * Execute a workflow by ID with a triggering event.
 */
export async function executeWorkflow(
  workflowId: string,
  event: CrmWorkflowEvent
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

  return executeWorkflowFromData(workflow as unknown as Workflow, event, supabase);
}

/**
 * Execute a workflow from its loaded data.
 */
export async function executeWorkflowFromData(
  workflow: Workflow,
  event: CrmWorkflowEvent,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>
) {
  const vars = await buildVars(event, supabase);

  const workflowData: WorkflowData = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: (workflow.nodes ?? []) as FlowNode[],
    edges: (workflow.edges ?? []) as FlowEdge[],
    is_active: workflow.is_active,
    trigger_type: workflow.trigger_type,
  };

  return genericExecuteWorkflow(workflowData, event, {
    vars,
    dealId: event.dealId,
    contactId: event.contactId,
    userId: workflow.created_by ?? undefined,
  }, getEngineConfig());
}

/**
 * Resume a paused workflow run (called after delay expires).
 */
export async function resumeWorkflowRun(runId: string) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId, status: "failed" as const, nodeOutputs: {}, error: "Supabase not configured" };
  }

  const { data: run } = await supabase
    .from("crm_workflow_runs")
    .select("*, workflow:crm_workflows(*)")
    .eq("id", runId)
    .single();

  if (!run || run.status !== "paused") {
    return { runId, status: "failed" as const, nodeOutputs: {}, error: "Run not found or not paused" };
  }

  const workflow = run.workflow as unknown as Workflow;
  const nodeOutputs = (run.node_outputs ?? {}) as Record<string, unknown>;
  const resumeTargets = (nodeOutputs._resume_targets ?? []) as string[];
  const triggerEvent = (run.trigger_event ?? {}) as CrmWorkflowEvent;

  if (resumeTargets.length === 0) {
    await supabase.from("crm_workflow_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      node_outputs: nodeOutputs,
    }).eq("id", runId);
    return { runId, status: "completed" as const, nodeOutputs };
  }

  const vars = await buildVars(triggerEvent, supabase);

  const workflowData: WorkflowData = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: (workflow.nodes ?? []) as FlowNode[],
    edges: (workflow.edges ?? []) as FlowEdge[],
    is_active: workflow.is_active,
    trigger_type: workflow.trigger_type,
  };

  return genericResumeWorkflow(
    workflowData,
    runId,
    resumeTargets,
    nodeOutputs,
    triggerEvent,
    {
      vars,
      dealId: triggerEvent.dealId,
      contactId: triggerEvent.contactId,
      userId: workflow.created_by ?? undefined,
    },
    getEngineConfig()
  );
}
