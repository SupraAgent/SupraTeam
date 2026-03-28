/**
 * Loop Builder server-side execution engine.
 *
 * Bridges the Loop Builder's CRM node types (crmTriggerNode, crmActionNode,
 * crmConditionNode) to the existing CRM workflow infrastructure — Supabase
 * persistence, action executors, template rendering, and alerting.
 *
 * The Loop Builder canvas stores workflows in the same crm_workflows table,
 * but uses its own node types. This engine translates those at execution time
 * so the existing persistence and action executors work unchanged.
 */
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
  type ActionContext,
  type ActionResult,
} from "@/lib/workflow-actions";
import type { Workflow } from "@/lib/workflow-db-types";
import type { PersistenceAdapter } from "@supra/automation-builder";

// ── Types ───────────────────────────────────────────────────

export interface LoopWorkflowEvent {
  type: string;
  dealId?: string;
  contactId?: string;
  payload: Record<string, unknown>;
}

interface LoopRunResult {
  runId: string;
  status: "completed" | "failed" | "paused";
  nodeOutputs: Record<string, NodeOutput>;
  error?: string;
}

interface NodeOutput {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}

// ── Template Var Builder ────────────────────────────────────

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

// ── CRM Action Executor ─────────────────────────────────────

async function executeCrmAction(
  actionType: string,
  config: Record<string, string>,
  ctx: ActionContext
): Promise<ActionResult> {
  switch (actionType) {
    case "send_telegram":
      return executeSendTelegram({ message: config.message || "", chat_id: config.chat_id }, ctx);
    case "send_email":
      return executeSendEmail({ to: config.to, subject: config.subject || "", body: config.body || "" }, ctx);
    case "send_slack":
      return executeSendSlack({ channel_id: config.channel_id || "", message: config.message || "" }, ctx);
    case "update_deal":
      return executeUpdateDeal({ field: config.field || "", value: config.value || "" }, ctx);
    case "update_contact":
      return executeUpdateContact({ field: config.field || "", value: config.value || "" }, ctx);
    case "assign_deal":
      return executeAssignDeal({ assign_to: config.assign_to || "" }, ctx);
    case "create_task":
      return executeCreateTask({
        title: config.title || "",
        description: config.description,
        due_hours: config.due_hours ? Number(config.due_hours) : undefined,
      }, ctx);
    default: {
      // Delegate to the CRM execute endpoint for extended actions
      // (broadcast, tag ops, AI, sequences, http)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL ? "" : "http://localhost:3002"}/api/loop/crm-execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionType, config, context: ctx }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { success: false, error: errData.error || `HTTP ${res.status}` };
      }
      return await res.json();
    }
  }
}

// ── Condition Evaluator ─────────────────────────────────────

function evaluateCondition(
  field: string,
  operator: string,
  value: string,
  vars: Record<string, string | number | undefined>,
  dealData?: Record<string, unknown>
): boolean {
  const actual = vars[field] ?? dealData?.[field];
  const actualStr = actual == null ? "" : String(actual);
  const actualNum = Number(actual);

  switch (operator) {
    case "equals":
      return actualStr.toLowerCase() === value.toLowerCase();
    case "not_equals":
      return actualStr.toLowerCase() !== value.toLowerCase();
    case "contains":
      return actualStr.toLowerCase().includes(value.toLowerCase());
    case "gt":
      return !isNaN(actualNum) && actualNum > Number(value);
    case "lt":
      return !isNaN(actualNum) && actualNum < Number(value);
    case "is_empty":
      return actualStr.trim() === "";
    default:
      return false;
  }
}

// ── Topological Execution ───────────────────────────────────

interface LoopNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface LoopEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

/**
 * Get execution order via Kahn's algorithm (topological sort).
 * Returns node IDs in execution order.
 */
function getExecutionOrder(nodes: LoopNode[], edges: LoopEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      const newDeg = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, newDeg);
      if (newDeg === 0) queue.push(target);
    }
  }

  return order;
}

// ── Main Execution Function ─────────────────────────────────

async function executeWorkflowNodes(
  workflowId: string,
  nodes: LoopNode[],
  edges: LoopEdge[],
  event: LoopWorkflowEvent,
  vars: Record<string, string | number | undefined>,
  userId: string | undefined,
  persistence: PersistenceAdapter,
  dryRun: boolean
): Promise<LoopRunResult> {
  const runId = await persistence.createRun(workflowId, event);
  const nodeOutputs: Record<string, NodeOutput> = {};
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Track which nodes should be skipped (false branch of conditions)
  const skippedNodes = new Set<string>();

  const executionOrder = getExecutionOrder(nodes, edges);

  const ctx: ActionContext = {
    workflowId,
    runId,
    dealId: event.dealId,
    contactId: event.contactId,
    userId,
    vars,
  };

  try {
    for (const nodeId of executionOrder) {
      if (skippedNodes.has(nodeId)) {
        nodeOutputs[nodeId] = { success: true, output: { skipped: true } };
        continue;
      }

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      await persistence.updateRun(runId, "running", nodeOutputs, undefined, nodeId);

      const start = Date.now();

      try {
        if (node.type === "crmTriggerNode") {
          // Triggers don't execute — they define when the workflow fires
          nodeOutputs[nodeId] = {
            success: true,
            output: { trigger: node.data.crmTrigger, event: event.type },
            durationMs: Date.now() - start,
          };
        } else if (node.type === "crmActionNode") {
          const actionType = node.data.crmAction as string;
          const config = (node.data.config ?? {}) as Record<string, string>;

          // Render template vars in all config string values
          const renderedConfig: Record<string, string> = {};
          for (const [k, v] of Object.entries(config)) {
            renderedConfig[k] = renderTemplate(v, vars);
          }

          if (dryRun) {
            nodeOutputs[nodeId] = {
              success: true,
              output: { dryRun: true, action: actionType, config: renderedConfig },
              durationMs: Date.now() - start,
            };
          } else {
            const result = await executeCrmAction(actionType, renderedConfig, ctx);
            nodeOutputs[nodeId] = {
              success: result.success,
              output: result.output,
              error: result.error,
              durationMs: Date.now() - start,
            };
          }
        } else if (node.type === "crmConditionNode") {
          const field = (node.data.field as string) || "stage";
          const operator = (node.data.operator as string) || "equals";
          const value = renderTemplate((node.data.value as string) || "", vars);

          const conditionResult = evaluateCondition(field, operator, value, vars);

          nodeOutputs[nodeId] = {
            success: true,
            output: { condition: conditionResult, field, operator, value },
            durationMs: Date.now() - start,
          };

          // Skip nodes on the false branch
          const outgoingEdges = edges.filter((e) => e.source === nodeId);
          for (const edge of outgoingEdges) {
            if (conditionResult && edge.sourceHandle === "false") {
              markBranchSkipped(edge.target, edges, skippedNodes);
            } else if (!conditionResult && (edge.sourceHandle === "true" || !edge.sourceHandle)) {
              markBranchSkipped(edge.target, edges, skippedNodes);
            }
          }
        } else if (node.type === "delayNode") {
          const delayMs = Number(node.data.delay_ms ?? node.data.delay ?? 0);
          if (dryRun || delayMs <= 0) {
            nodeOutputs[nodeId] = {
              success: true,
              output: { dryRun: true, delayMs },
              durationMs: 0,
            };
          } else {
            // Schedule resume via persistence adapter
            const resumeAt = new Date(Date.now() + delayMs).toISOString();
            nodeOutputs._resume_targets = { success: true, output: getDownstreamNodes(nodeId, edges) } as unknown as NodeOutput;
            await persistence.scheduleResume?.(runId, workflowId, resumeAt, event);
            await persistence.updateRun(runId, "paused", nodeOutputs);
            return { runId, status: "paused", nodeOutputs };
          }
        } else {
          // Unknown node type — skip gracefully
          nodeOutputs[nodeId] = {
            success: true,
            output: { type: node.type, label: node.data.label, note: "Non-CRM node (skipped in server execution)" },
            durationMs: Date.now() - start,
          };
        }
      } catch (err) {
        nodeOutputs[nodeId] = {
          success: false,
          error: err instanceof Error ? err.message : "Node execution failed",
          durationMs: Date.now() - start,
        };

        // Fail the entire workflow on action errors (except in dry-run)
        if (!dryRun && node.type === "crmActionNode") {
          await persistence.updateRun(runId, "failed", nodeOutputs, nodeOutputs[nodeId].error);
          await persistence.onWorkflowComplete?.(workflowId);
          return { runId, status: "failed", nodeOutputs, error: nodeOutputs[nodeId].error };
        }
      }
    }

    await persistence.updateRun(runId, "completed", nodeOutputs);
    await persistence.onWorkflowComplete?.(workflowId);
    return { runId, status: "completed", nodeOutputs };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Workflow execution failed";
    await persistence.updateRun(runId, "failed", nodeOutputs, error);
    await persistence.onWorkflowComplete?.(workflowId);
    return { runId, status: "failed", nodeOutputs, error };
  }
}

/** Recursively mark all downstream nodes as skipped */
function markBranchSkipped(nodeId: string, edges: LoopEdge[], skipped: Set<string>) {
  if (skipped.has(nodeId)) return;
  skipped.add(nodeId);
  for (const edge of edges) {
    if (edge.source === nodeId) {
      markBranchSkipped(edge.target, edges, skipped);
    }
  }
}

/** Get direct downstream node IDs */
function getDownstreamNodes(nodeId: string, edges: LoopEdge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

// ── Dry-Run Persistence (no DB writes) ──────────────────────

function createDryRunPersistence(): PersistenceAdapter {
  return {
    createRun: async () => `dry-run-${Date.now()}`,
    updateRun: async () => {},
    scheduleResume: async () => {},
    onWorkflowComplete: async () => {},
  };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Execute a Loop Builder workflow by ID.
 * Loads from DB, resolves CRM context, runs server-side.
 */
export async function executeLoopWorkflow(
  workflowId: string,
  event: LoopWorkflowEvent
): Promise<LoopRunResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Supabase not configured" };
  }

  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!workflow) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow not found" };
  }

  const nodes = (workflow.nodes ?? []) as LoopNode[];
  const edges = (workflow.edges ?? []) as LoopEdge[];
  const vars = await buildVars(event, supabase);
  const persistence = createSupabasePersistence();

  return executeWorkflowNodes(
    workflowId, nodes, edges, event, vars,
    (workflow as unknown as Workflow).created_by ?? undefined,
    persistence, false
  );
}

/**
 * Execute a Loop Builder workflow in dry-run mode.
 * Traverses the graph and evaluates conditions but doesn't execute actions.
 */
export async function executeLoopWorkflowDryRun(
  workflowId: string,
  event: LoopWorkflowEvent
): Promise<LoopRunResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Supabase not configured" };
  }

  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!workflow) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow not found" };
  }

  const nodes = (workflow.nodes ?? []) as LoopNode[];
  const edges = (workflow.edges ?? []) as LoopEdge[];
  const vars = await buildVars(event, supabase);

  return executeWorkflowNodes(
    workflowId, nodes, edges, event, vars,
    (workflow as unknown as Workflow).created_by ?? undefined,
    createDryRunPersistence(), true
  );
}

/**
 * Find and execute all active Loop Builder workflows matching a trigger type.
 * Called by the automation engine when CRM events fire.
 */
export async function triggerLoopWorkflowsByEvent(
  triggerType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return;

  // Find active workflows with matching trigger type
  const { data: workflows } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("is_active", true)
    .eq("trigger_type", triggerType);

  if (!workflows || workflows.length === 0) return;

  // Filter to Loop Builder workflows (have crmTriggerNode nodes)
  const loopWorkflows = workflows.filter((wf) => {
    const nodes = (wf.nodes ?? []) as LoopNode[];
    return nodes.some((n) => n.type === "crmTriggerNode");
  });

  if (loopWorkflows.length === 0) return;

  // Execute in batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < loopWorkflows.length; i += BATCH_SIZE) {
    const batch = loopWorkflows.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (wf) => {
        const nodes = (wf.nodes ?? []) as LoopNode[];
        const triggerNode = nodes.find((n) => n.type === "crmTriggerNode");
        if (!triggerNode) return;

        // Match trigger config against payload
        const triggerConfig = (triggerNode.data.config ?? {}) as Record<string, string>;
        if (triggerType === "deal_stage_change") {
          if (triggerConfig.stage_name && triggerConfig.stage_name !== payload.to_stage_name) return;
        }
        if (triggerType === "tg_message") {
          if (triggerConfig.group_id && String(triggerConfig.group_id) !== String(payload.chat_id)) return;
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
