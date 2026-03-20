/**
 * Workflow execution engine.
 * Loads a workflow's node/edge graph and traverses it, executing each node.
 */
import { createSupabaseAdmin } from "@/lib/supabase";
import { renderTemplate } from "@/lib/telegram-templates";
import {
  executeSendTelegram,
  executeSendEmail,
  executeUpdateDeal,
  executeCreateTask,
  type ActionContext,
  type ActionResult,
} from "@/lib/workflow-actions";
import type {
  WorkflowNodeData,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  Workflow,
} from "@/lib/workflow-types";

interface FlowNode {
  id: string;
  type: string;
  data: WorkflowNodeData;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface WorkflowEvent {
  type: string;
  dealId?: string;
  contactId?: string;
  payload: Record<string, unknown>;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed" | "paused";
  nodeOutputs: Record<string, unknown>;
  error?: string;
}

/**
 * Execute a workflow by ID with a triggering event.
 */
export async function executeWorkflow(
  workflowId: string,
  event: WorkflowEvent
): Promise<RunResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Supabase not configured" };
  }

  // Load workflow
  const { data: workflow } = await supabase
    .from("crm_workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!workflow) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow not found" };
  }

  return executeWorkflowFromData(workflow as Workflow, event, supabase);
}

/**
 * Execute a workflow from its loaded data.
 */
export async function executeWorkflowFromData(
  workflow: Workflow,
  event: WorkflowEvent,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>
): Promise<RunResult> {
  const nodes = (workflow.nodes ?? []) as FlowNode[];
  const edges = (workflow.edges ?? []) as FlowEdge[];

  if (nodes.length === 0) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow has no nodes" };
  }

  // Create run record
  const { data: run } = await supabase
    .from("crm_workflow_runs")
    .insert({
      workflow_id: workflow.id,
      trigger_event: event,
      status: "running",
    })
    .select("id")
    .single();

  const runId = run?.id ?? "";
  const nodeOutputs: Record<string, unknown> = {};

  // Build adjacency map: nodeId -> outgoing edges
  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  // Build template vars from event
  const vars: Record<string, string | number | undefined> = {
    ...Object.fromEntries(
      Object.entries(event.payload).map(([k, v]) => [k, v == null ? undefined : String(v)])
    ),
  };

  // Load deal data for template vars if available
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

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    dealId: event.dealId,
    contactId: event.contactId,
    userId: workflow.created_by ?? undefined,
    vars,
  };

  // Find trigger node (entry point)
  const triggerNode = nodes.find((n) => n.type === "trigger");
  if (!triggerNode) {
    await updateRun(supabase, runId, "failed", nodeOutputs, "No trigger node found");
    return { runId, status: "failed", nodeOutputs, error: "No trigger node found" };
  }

  // BFS traversal from trigger node
  const queue: string[] = [triggerNode.id];
  const visited = new Set<string>();

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Update current node on run
      await supabase
        .from("crm_workflow_runs")
        .update({ current_node_id: nodeId })
        .eq("id", runId);

      const data = node.data;

      // ── Trigger node: just pass through ──
      if (data.nodeType === "trigger") {
        nodeOutputs[nodeId] = { type: "trigger", triggered: true };
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      // ── Action node: execute the action ──
      if (data.nodeType === "action") {
        const result = await executeActionNode(data as ActionNodeData, actionCtx);
        nodeOutputs[nodeId] = result;

        if (!result.success) {
          // Log failure but continue — don't halt the whole workflow
          console.error(`[workflow] Action node ${nodeId} failed: ${result.error}`);
        }

        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      // ── Condition node: evaluate and follow true/false path ──
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data as ConditionNodeData, actionCtx);
        nodeOutputs[nodeId] = { condition: condResult };

        const nextEdges = outEdges.get(nodeId) ?? [];
        const targetHandle = condResult ? "true" : "false";

        for (const e of nextEdges) {
          // Match edge by sourceHandle (true/false)
          if (e.sourceHandle === targetHandle) {
            queue.push(e.target);
          }
        }
        continue;
      }

      // ── Delay node: pause the run ──
      if (data.nodeType === "delay") {
        const delayData = data as DelayNodeData;
        const cfg = delayData.config;
        let delayMs = cfg.duration * 60 * 1000; // default minutes
        if (cfg.unit === "hours") delayMs = cfg.duration * 60 * 60 * 1000;
        if (cfg.unit === "days") delayMs = cfg.duration * 24 * 60 * 60 * 1000;

        const resumeAt = new Date(Date.now() + delayMs).toISOString();

        // Store resume info and pause
        nodeOutputs[nodeId] = { delay: true, resumeAt, unit: cfg.unit, duration: cfg.duration };

        // Find what comes after this delay node
        const nextEdges = outEdges.get(nodeId) ?? [];
        const nextNodeIds = nextEdges.map((e) => e.target);

        await supabase
          .from("crm_workflow_runs")
          .update({
            status: "paused",
            current_node_id: nodeId,
            node_outputs: { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          })
          .eq("id", runId);

        // Schedule a resume via crm_scheduled_messages (piggyback existing cron)
        await supabase.from("crm_scheduled_messages").insert({
          deal_id: event.dealId || null,
          tg_chat_id: 0, // sentinel — not a real TG message
          message_text: JSON.stringify({ _workflow_resume: true, run_id: runId, workflow_id: workflow.id }),
          send_at: resumeAt,
          status: "pending",
        });

        return { runId, status: "paused", nodeOutputs };
      }
    }

    // Completed successfully
    await updateRun(supabase, runId, "completed", nodeOutputs);

    // Update workflow stats
    await supabase
      .from("crm_workflows")
      .update({
        last_run_at: new Date().toISOString(),
        run_count: (workflow.run_count ?? 0) + 1,
      })
      .eq("id", workflow.id);

    return { runId, status: "completed", nodeOutputs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await updateRun(supabase, runId, "failed", nodeOutputs, errorMsg);
    return { runId, status: "failed", nodeOutputs, error: errorMsg };
  }
}

/**
 * Resume a paused workflow run (called after delay expires).
 */
export async function resumeWorkflowRun(runId: string): Promise<RunResult> {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return { runId, status: "failed", nodeOutputs: {}, error: "Supabase not configured" };
  }

  const { data: run } = await supabase
    .from("crm_workflow_runs")
    .select("*, workflow:crm_workflows(*)")
    .eq("id", runId)
    .single();

  if (!run || run.status !== "paused") {
    return { runId, status: "failed", nodeOutputs: {}, error: "Run not found or not paused" };
  }

  const workflow = run.workflow as unknown as Workflow;
  const nodeOutputs = (run.node_outputs ?? {}) as Record<string, unknown>;
  const resumeTargets = (nodeOutputs._resume_targets ?? []) as string[];
  const triggerEvent = (run.trigger_event ?? {}) as WorkflowEvent;

  if (resumeTargets.length === 0) {
    await updateRun(supabase, runId, "completed", nodeOutputs);
    return { runId, status: "completed", nodeOutputs };
  }

  // Mark as running again
  await supabase
    .from("crm_workflow_runs")
    .update({ status: "running" })
    .eq("id", runId);

  // Re-execute from resume targets
  const nodes = (workflow.nodes ?? []) as FlowNode[];
  const edges = (workflow.edges ?? []) as FlowEdge[];

  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  // Rebuild vars
  const vars: Record<string, string | number | undefined> = {
    ...Object.fromEntries(
      Object.entries(triggerEvent.payload ?? {}).map(([k, v]) => [k, v == null ? undefined : String(v)])
    ),
  };

  if (triggerEvent.dealId) {
    const { data: deal } = await supabase
      .from("crm_deals")
      .select("*, stage:pipeline_stages(name), contact:crm_contacts(name, email, company)")
      .eq("id", triggerEvent.dealId)
      .single();

    if (deal) {
      vars.deal_name = deal.deal_name as string;
      vars.board_type = (deal.board_type as string) ?? "Unknown";
      vars.stage = (deal.stage as { name: string } | null)?.name ?? "Unknown";
      vars.value = deal.value as number | undefined;
    }
  }

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    dealId: triggerEvent.dealId,
    contactId: triggerEvent.contactId,
    userId: workflow.created_by ?? undefined,
    vars,
  };

  // Clean up internal resume keys
  delete nodeOutputs._resume_targets;
  delete nodeOutputs._resume_at;

  const queue = [...resumeTargets];
  const visited = new Set<string>(Object.keys(nodeOutputs));

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      await supabase
        .from("crm_workflow_runs")
        .update({ current_node_id: nodeId })
        .eq("id", runId);

      const data = node.data;

      if (data.nodeType === "action") {
        const result = await executeActionNode(data as ActionNodeData, actionCtx);
        nodeOutputs[nodeId] = result;
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data as ConditionNodeData, actionCtx);
        nodeOutputs[nodeId] = { condition: condResult };
        const nextEdges = outEdges.get(nodeId) ?? [];
        const targetHandle = condResult ? "true" : "false";
        for (const e of nextEdges) {
          if (e.sourceHandle === targetHandle) queue.push(e.target);
        }
        continue;
      }

      if (data.nodeType === "delay") {
        const delayData = data as DelayNodeData;
        const cfg = delayData.config;
        let delayMs = cfg.duration * 60 * 1000;
        if (cfg.unit === "hours") delayMs = cfg.duration * 60 * 60 * 1000;
        if (cfg.unit === "days") delayMs = cfg.duration * 24 * 60 * 60 * 1000;

        const resumeAt = new Date(Date.now() + delayMs).toISOString();
        nodeOutputs[nodeId] = { delay: true, resumeAt };

        const nextEdges = outEdges.get(nodeId) ?? [];
        const nextNodeIds = nextEdges.map((e) => e.target);

        await supabase
          .from("crm_workflow_runs")
          .update({
            status: "paused",
            current_node_id: nodeId,
            node_outputs: { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          })
          .eq("id", runId);

        await supabase.from("crm_scheduled_messages").insert({
          deal_id: triggerEvent.dealId || null,
          tg_chat_id: 0,
          message_text: JSON.stringify({ _workflow_resume: true, run_id: runId, workflow_id: workflow.id }),
          send_at: resumeAt,
          status: "pending",
        });

        return { runId, status: "paused", nodeOutputs };
      }

      // Unknown node type — skip
      const nextEdges = outEdges.get(nodeId) ?? [];
      for (const e of nextEdges) queue.push(e.target);
    }

    await updateRun(supabase, runId, "completed", nodeOutputs);

    await supabase
      .from("crm_workflows")
      .update({
        last_run_at: new Date().toISOString(),
        run_count: (workflow.run_count ?? 0) + 1,
      })
      .eq("id", workflow.id);

    return { runId, status: "completed", nodeOutputs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await updateRun(supabase, runId, "failed", nodeOutputs, errorMsg);
    return { runId, status: "failed", nodeOutputs, error: errorMsg };
  }
}

// ── Helpers ──────────────────────────────────────────────────────

async function executeActionNode(
  data: ActionNodeData,
  ctx: ActionContext
): Promise<ActionResult> {
  switch (data.actionType) {
    case "send_telegram":
      return executeSendTelegram(data.config as Parameters<typeof executeSendTelegram>[0], ctx);
    case "send_email":
      return executeSendEmail(data.config as Parameters<typeof executeSendEmail>[0], ctx);
    case "update_deal":
      return executeUpdateDeal(data.config as Parameters<typeof executeUpdateDeal>[0], ctx);
    case "create_task":
      return executeCreateTask(data.config as Parameters<typeof executeCreateTask>[0], ctx);
    default:
      return { success: false, error: `Unknown action type: ${data.actionType}` };
  }
}

function evaluateCondition(data: ConditionNodeData, ctx: ActionContext): boolean {
  const { field, operator, value } = data.config;
  const actual = String(ctx.vars[field] ?? "");
  const expected = value;

  switch (operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return actual.includes(expected);
    case "gt": return Number(actual) > Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "is_empty": return actual === "" || actual === "undefined";
    case "is_not_empty": return actual !== "" && actual !== "undefined";
    default: return false;
  }
}

async function updateRun(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  runId: string,
  status: string,
  nodeOutputs: Record<string, unknown>,
  error?: string
) {
  if (!runId) return;
  await supabase
    .from("crm_workflow_runs")
    .update({
      status,
      node_outputs: nodeOutputs,
      error: error ?? null,
      completed_at: status === "completed" || status === "failed" ? new Date().toISOString() : null,
    })
    .eq("id", runId);
}
