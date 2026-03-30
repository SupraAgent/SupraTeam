/**
 * Generic workflow execution engine.
 * BFS traversal of node/edge graph with pluggable action execution and persistence.
 * No database or app-specific dependencies.
 */
import type {
  FlowNode,
  FlowEdge,
  WorkflowData,
  WorkflowEvent,
  ActionContext,
  ActionResult,
  ActionExecutor,
  PersistenceAdapter,
  RunResult,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  LoopNodeData,
  MergeNodeData,
  SubworkflowNodeData,
  NodeRetryConfig,
} from "./types";

export interface EngineConfig {
  /** Executes action nodes — provided by consuming app */
  executeAction: ActionExecutor;
  /** Persistence adapter for run tracking */
  persistence: PersistenceAdapter;
  /** Template variable renderer. Default: simple {{var}} replacement */
  renderTemplate?: (template: string, vars: Record<string, string | number | undefined>) => string;
  /** Max retries for failed actions. Default: 2 */
  maxRetries?: number;
  /** Dry-run mode: traverses the graph, evaluates conditions, but skips actual action execution.
   *  Actions return simulated success with `{ dryRun: true }` output. */
  dryRun?: boolean;
}

/**
 * Simple {{var}} template renderer.
 */
export function defaultRenderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val == null ? "" : String(val);
  });
}

/**
 * Execute a workflow from its data.
 */
export async function executeWorkflow(
  workflow: WorkflowData,
  event: WorkflowEvent,
  context: Partial<ActionContext>,
  config: EngineConfig
): Promise<RunResult> {
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];

  if (nodes.length === 0) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow has no nodes" };
  }

  const runId = await config.persistence.createRun(workflow.id, event);
  const nodeOutputs: Record<string, unknown> = {};

  // Build adjacency map
  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    vars: (context.vars ?? {}) as Record<string, string | number | undefined>,
    ...context,
  };

  // Find trigger node (entry point)
  const triggerNode = nodes.find((n) => n.type === "trigger");
  if (!triggerNode) {
    await config.persistence.updateRun(runId, "failed", nodeOutputs, "No trigger node found");
    return { runId, status: "failed", nodeOutputs, error: "No trigger node found" };
  }

  // Build incoming edge count map (for merge nodes)
  const incomingEdgeCount = new Map<string, number>();
  for (const edge of edges) {
    incomingEdgeCount.set(edge.target, (incomingEdgeCount.get(edge.target) ?? 0) + 1);
  }
  const mergeArrivalCount = new Map<string, number>();

  const queue: string[] = [triggerNode.id];
  const visited = new Set<string>();

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // ── Merge: gate on incoming branch arrivals ──
      if (node.data.nodeType === "merge") {
        const mergeData = node.data as MergeNodeData;
        const arrivals = (mergeArrivalCount.get(nodeId) ?? 0) + 1;
        mergeArrivalCount.set(nodeId, arrivals);
        const totalIncoming = incomingEdgeCount.get(nodeId) ?? 1;

        if (mergeData.config.mode === "all") {
          if (arrivals < totalIncoming) continue; // wait for more branches
          // All arrived — fall through to process
        } else {
          // "any" mode: process on first arrival, skip later ones
          if (visited.has(nodeId)) continue;
        }
        visited.add(nodeId);
        nodeOutputs[nodeId] = { merge: true, mode: mergeData.config.mode, arrivals, totalIncoming };
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      await config.persistence.updateRun(runId, "running", nodeOutputs, undefined, nodeId);

      const data = node.data;

      // ── Trigger: pass through ──
      if (data.nodeType === "trigger") {
        nodeOutputs[nodeId] = { type: "trigger", triggered: true };
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      // ── Action: execute via plugin ──
      if (data.nodeType === "action") {
        const actionData = data as ActionNodeData;
        // Record node start for live overlay
        if (config.persistence.recordNodeStart) {
          await config.persistence.recordNodeStart(runId, nodeId);
        }
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config,
          actionData.retryConfig
        );
        nodeOutputs[nodeId] = result;

        const nextEdges = outEdges.get(nodeId) ?? [];
        if (!result.success) {
          console.error(`[automation-builder] Action node ${nodeId} failed: ${result.error}`);
          // Inject error context vars for downstream error-path nodes
          actionCtx.vars.error_message = result.error ?? "Unknown error";
          actionCtx.vars.failed_node = nodeId;
          actionCtx.vars.failed_action = actionData.actionType;
          // Follow error edges only (if any exist); otherwise halt downstream
          const errorEdges = nextEdges.filter((e) => e.sourceHandle === "error");
          for (const e of errorEdges) queue.push(e.target);
          continue;
        }
        // Clear error context on success path
        delete actionCtx.vars.error_message;
        delete actionCtx.vars.failed_node;
        delete actionCtx.vars.failed_action;
        // Follow success edges (non-error handles, including legacy nodes with no handle id)
        const successEdges = nextEdges.filter((e) => e.sourceHandle !== "error");
        for (const e of successEdges) queue.push(e.target);
        continue;
      }

      // ── Condition: evaluate and branch ──
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

      // ── Loop: iterate over an array and execute item-edge targets per item ──
      if (data.nodeType === "loop") {
        const loopData = data as LoopNodeData;
        const cfg = loopData.config;
        const renderFn = config.renderTemplate ?? defaultRenderTemplate;

        // Resolve source array from vars
        let sourceArray: unknown[];
        const rawSource = actionCtx.vars[cfg.sourceVariable];
        if (typeof rawSource === "string") {
          try { sourceArray = JSON.parse(rawSource); } catch { sourceArray = [rawSource]; }
        } else if (Array.isArray(rawSource)) {
          sourceArray = rawSource;
        } else {
          sourceArray = rawSource ? [rawSource] : [];
        }

        // Safety limit
        const maxIter = Math.min(cfg.maxIterations || 100, 1000);
        sourceArray = sourceArray.slice(0, maxIter);

        // Partition downstream edges by handle
        const nextEdges = outEdges.get(nodeId) ?? [];
        const itemEdges = nextEdges.filter((e) => e.sourceHandle === "item");
        const doneEdges = nextEdges.filter((e) => e.sourceHandle === "done" || e.sourceHandle !== "item");

        const iterResults: unknown[] = [];
        let iterErrors = 0;

        for (let i = 0; i < sourceArray.length; i++) {
          const item = sourceArray[i];
          // Set iteration context vars
          actionCtx.vars[cfg.itemVariable || "item"] =
            typeof item === "object" ? JSON.stringify(item) : String(item ?? "");
          actionCtx.vars.loop_index = i;
          actionCtx.vars.loop_total = sourceArray.length;

          // Execute immediate item-path target nodes (actions + conditions)
          for (const edge of itemEdges) {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!targetNode) continue;

            const targetData = targetNode.data;
            if (targetData.nodeType === "action") {
              const actionData = targetData as ActionNodeData;
              const actionConfig = { ...actionData.config };
              for (const [k, v] of Object.entries(actionConfig)) {
                if (typeof v === "string") {
                  (actionConfig as Record<string, unknown>)[k] = renderFn(
                    v,
                    actionCtx.vars as Record<string, string | number | undefined>
                  );
                }
              }
              const result = await executeActionWithRetry(
                actionData.actionType,
                actionConfig,
                actionCtx,
                config,
                actionData.retryConfig
              );
              nodeOutputs[`${targetNode.id}_iter_${i}`] = { ...result, iteration: i, item };
              if (!result.success) {
                iterErrors++;
                if (!cfg.continueOnError) break;
              } else {
                iterResults.push(result.output);
              }
            } else if (targetData.nodeType === "condition") {
              // Evaluate condition and follow matching branch targets
              const condResult = evaluateCondition(targetData as ConditionNodeData, actionCtx);
              nodeOutputs[`${targetNode.id}_iter_${i}`] = { condition: condResult, iteration: i, item };
              const condHandle = condResult ? "true" : "false";
              const condEdges = outEdges.get(targetNode.id) ?? [];
              for (const ce of condEdges) {
                if (ce.sourceHandle !== condHandle) continue;
                const branchNode = nodes.find((n) => n.id === ce.target);
                if (!branchNode || branchNode.data.nodeType !== "action") continue;
                const branchAction = branchNode.data as ActionNodeData;
                const branchConfig = { ...branchAction.config };
                for (const [k, v] of Object.entries(branchConfig)) {
                  if (typeof v === "string") {
                    (branchConfig as Record<string, unknown>)[k] = renderFn(
                      v, actionCtx.vars as Record<string, string | number | undefined>
                    );
                  }
                }
                const branchResult = await executeActionWithRetry(
                  branchAction.actionType, branchConfig, actionCtx, config, branchAction.retryConfig
                );
                nodeOutputs[`${branchNode.id}_iter_${i}`] = { ...branchResult, iteration: i, item };
                if (!branchResult.success) {
                  iterErrors++;
                  if (!cfg.continueOnError) break;
                } else {
                  iterResults.push(branchResult.output);
                }
                // Mark branch targets as visited so BFS doesn't re-execute
                visited.add(branchNode.id);
              }
              visited.add(targetNode.id);
            }
          }

          if (iterErrors > 0 && !cfg.continueOnError) break;
        }

        // Store loop summary
        nodeOutputs[nodeId] = {
          success: true,
          iterations: sourceArray.length,
          completed: sourceArray.length - iterErrors,
          errors: iterErrors,
          results: iterResults,
        };

        // Mark item-edge targets as visited so BFS doesn't re-execute them
        for (const edge of itemEdges) {
          visited.add(edge.target);
        }

        // Follow done edges
        for (const e of doneEdges) {
          if (e.sourceHandle === "done" || !itemEdges.some((ie) => ie.id === e.id)) {
            queue.push(e.target);
          }
        }

        // Clean up iteration vars
        delete actionCtx.vars[cfg.itemVariable || "item"];
        delete actionCtx.vars.loop_index;
        delete actionCtx.vars.loop_total;

        continue;
      }

      // ── Delay: pause the run (or skip in dry-run) ──
      if (data.nodeType === "delay") {
        const delayData = data as DelayNodeData;
        const cfg = delayData.config;
        let delayMs = cfg.duration * 60 * 1000;
        if (cfg.unit === "hours") delayMs = cfg.duration * 60 * 60 * 1000;
        if (cfg.unit === "days") delayMs = cfg.duration * 24 * 60 * 60 * 1000;

        const resumeAt = new Date(Date.now() + delayMs).toISOString();
        nodeOutputs[nodeId] = { delay: true, resumeAt, unit: cfg.unit, duration: cfg.duration };

        // Dry-run: skip actual pause, continue traversal
        if (config.dryRun) {
          (nodeOutputs[nodeId] as Record<string, unknown>).dryRun = true;
          const nextEdges = outEdges.get(nodeId) ?? [];
          for (const e of nextEdges) queue.push(e.target);
          continue;
        }

        const nextEdges = outEdges.get(nodeId) ?? [];
        const nextNodeIds = nextEdges.map((e) => e.target);

        await config.persistence.updateRun(
          runId,
          "paused",
          { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          undefined,
          nodeId
        );

        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }

        return { runId, status: "paused", nodeOutputs };
      }

      // ── Subworkflow: store marker for CRM layer to handle ──
      if (data.nodeType === "subworkflow") {
        const subData = data as SubworkflowNodeData;
        nodeOutputs[nodeId] = {
          subworkflow: true,
          workflowId: subData.config.workflowId,
          passVars: subData.config.passVars !== false,
          waitForCompletion: subData.config.waitForCompletion,
        };
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      // Unknown type — skip and continue
      const nextEdges = outEdges.get(nodeId) ?? [];
      for (const e of nextEdges) queue.push(e.target);
    }

    await config.persistence.updateRun(runId, "completed", nodeOutputs);
    if (config.persistence.onWorkflowComplete) {
      await config.persistence.onWorkflowComplete(workflow.id);
    }

    return { runId, status: "completed", nodeOutputs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await config.persistence.updateRun(runId, "failed", nodeOutputs, errorMsg);
    return { runId, status: "failed", nodeOutputs, error: errorMsg };
  }
}

/**
 * Resume a paused workflow from stored resume targets.
 */
export async function resumeWorkflow(
  workflow: WorkflowData,
  runId: string,
  resumeTargets: string[],
  existingOutputs: Record<string, unknown>,
  event: WorkflowEvent,
  context: Partial<ActionContext>,
  config: EngineConfig
): Promise<RunResult> {
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];
  const nodeOutputs = { ...existingOutputs };

  delete nodeOutputs._resume_targets;
  delete nodeOutputs._resume_at;

  const outEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }

  const actionCtx: ActionContext = {
    workflowId: workflow.id,
    runId,
    vars: (context.vars ?? {}) as Record<string, string | number | undefined>,
    ...context,
  };

  await config.persistence.updateRun(runId, "running", nodeOutputs);

  // Build incoming edge count map (for merge nodes)
  const incomingEdgeCount = new Map<string, number>();
  for (const edge of edges) {
    incomingEdgeCount.set(edge.target, (incomingEdgeCount.get(edge.target) ?? 0) + 1);
  }
  const mergeArrivalCount = new Map<string, number>();

  const queue = [...resumeTargets];
  const visited = new Set<string>(Object.keys(nodeOutputs));

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // ── Merge: gate on incoming branch arrivals ──
      if (node.data.nodeType === "merge") {
        const mergeData = node.data as MergeNodeData;
        const arrivals = (mergeArrivalCount.get(nodeId) ?? 0) + 1;
        mergeArrivalCount.set(nodeId, arrivals);
        const totalIncoming = incomingEdgeCount.get(nodeId) ?? 1;

        if (mergeData.config.mode === "all") {
          if (arrivals < totalIncoming) continue;
        } else {
          if (visited.has(nodeId)) continue;
        }
        visited.add(nodeId);
        nodeOutputs[nodeId] = { merge: true, mode: mergeData.config.mode, arrivals, totalIncoming };
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      await config.persistence.updateRun(runId, "running", nodeOutputs, undefined, nodeId);
      const data = node.data;

      if (data.nodeType === "action") {
        const actionData = data as ActionNodeData;
        if (config.persistence.recordNodeStart) {
          await config.persistence.recordNodeStart(runId, nodeId);
        }
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config,
          actionData.retryConfig
        );
        nodeOutputs[nodeId] = result;
        const nextEdges = outEdges.get(nodeId) ?? [];
        if (!result.success) {
          actionCtx.vars.error_message = result.error ?? "Unknown error";
          actionCtx.vars.failed_node = nodeId;
          actionCtx.vars.failed_action = actionData.actionType;
          const errorEdges = nextEdges.filter((e) => e.sourceHandle === "error");
          for (const e of errorEdges) queue.push(e.target);
          continue;
        }
        delete actionCtx.vars.error_message;
        delete actionCtx.vars.failed_node;
        delete actionCtx.vars.failed_action;
        // Follow success edges (non-error handles, including legacy nodes with no handle id)
        const successEdges = nextEdges.filter((e) => e.sourceHandle !== "error");
        for (const e of successEdges) queue.push(e.target);
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

      // ── Loop: iterate (same logic as executeWorkflow) ──
      if (data.nodeType === "loop") {
        const loopData = data as LoopNodeData;
        const cfg = loopData.config;
        const renderFn = config.renderTemplate ?? defaultRenderTemplate;

        let sourceArray: unknown[];
        const rawSource = actionCtx.vars[cfg.sourceVariable];
        if (typeof rawSource === "string") {
          try { sourceArray = JSON.parse(rawSource); } catch { sourceArray = [rawSource]; }
        } else if (Array.isArray(rawSource)) {
          sourceArray = rawSource;
        } else {
          sourceArray = rawSource ? [rawSource] : [];
        }

        const maxIter = Math.min(cfg.maxIterations || 100, 1000);
        sourceArray = sourceArray.slice(0, maxIter);

        const nextEdges = outEdges.get(nodeId) ?? [];
        const itemEdges = nextEdges.filter((e) => e.sourceHandle === "item");
        const doneEdges = nextEdges.filter((e) => e.sourceHandle === "done" || e.sourceHandle !== "item");

        const iterResults: unknown[] = [];
        let iterErrors = 0;

        for (let i = 0; i < sourceArray.length; i++) {
          const item = sourceArray[i];
          actionCtx.vars[cfg.itemVariable || "item"] =
            typeof item === "object" ? JSON.stringify(item) : String(item ?? "");
          actionCtx.vars.loop_index = i;
          actionCtx.vars.loop_total = sourceArray.length;

          for (const edge of itemEdges) {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!targetNode) continue;
            const targetData = targetNode.data;
            if (targetData.nodeType === "action") {
              const actionData = targetData as ActionNodeData;
              const actionConfig = { ...actionData.config };
              for (const [k, v] of Object.entries(actionConfig)) {
                if (typeof v === "string") {
                  (actionConfig as Record<string, unknown>)[k] = renderFn(
                    v, actionCtx.vars as Record<string, string | number | undefined>
                  );
                }
              }
              const result = await executeActionWithRetry(
                actionData.actionType, actionConfig, actionCtx, config, actionData.retryConfig
              );
              nodeOutputs[`${targetNode.id}_iter_${i}`] = { ...result, iteration: i, item };
              if (!result.success) {
                iterErrors++;
                if (!cfg.continueOnError) break;
              } else {
                iterResults.push(result.output);
              }
            } else if (targetData.nodeType === "condition") {
              const condResult = evaluateCondition(targetData as ConditionNodeData, actionCtx);
              nodeOutputs[`${targetNode.id}_iter_${i}`] = { condition: condResult, iteration: i, item };
              const condHandle = condResult ? "true" : "false";
              const condEdges = outEdges.get(targetNode.id) ?? [];
              for (const ce of condEdges) {
                if (ce.sourceHandle !== condHandle) continue;
                const branchNode = nodes.find((n) => n.id === ce.target);
                if (!branchNode || branchNode.data.nodeType !== "action") continue;
                const branchAction = branchNode.data as ActionNodeData;
                const branchConfig = { ...branchAction.config };
                for (const [k, v] of Object.entries(branchConfig)) {
                  if (typeof v === "string") {
                    (branchConfig as Record<string, unknown>)[k] = renderFn(
                      v, actionCtx.vars as Record<string, string | number | undefined>
                    );
                  }
                }
                const branchResult = await executeActionWithRetry(
                  branchAction.actionType, branchConfig, actionCtx, config, branchAction.retryConfig
                );
                nodeOutputs[`${branchNode.id}_iter_${i}`] = { ...branchResult, iteration: i, item };
                if (!branchResult.success) {
                  iterErrors++;
                  if (!cfg.continueOnError) break;
                } else {
                  iterResults.push(branchResult.output);
                }
                visited.add(branchNode.id);
              }
              visited.add(targetNode.id);
            }
          }
          if (iterErrors > 0 && !cfg.continueOnError) break;
        }

        nodeOutputs[nodeId] = {
          success: true, iterations: sourceArray.length,
          completed: sourceArray.length - iterErrors, errors: iterErrors, results: iterResults,
        };
        for (const edge of itemEdges) visited.add(edge.target);
        for (const e of doneEdges) {
          if (e.sourceHandle === "done" || !itemEdges.some((ie) => ie.id === e.id)) queue.push(e.target);
        }
        delete actionCtx.vars[cfg.itemVariable || "item"];
        delete actionCtx.vars.loop_index;
        delete actionCtx.vars.loop_total;
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

        await config.persistence.updateRun(
          runId,
          "paused",
          { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          undefined,
          nodeId
        );

        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }

        return { runId, status: "paused", nodeOutputs };
      }

      // ── Subworkflow: store marker for CRM layer to handle ──
      if (data.nodeType === "subworkflow") {
        const subData = data as SubworkflowNodeData;
        nodeOutputs[nodeId] = {
          subworkflow: true,
          workflowId: subData.config.workflowId,
          passVars: subData.config.passVars !== false,
          waitForCompletion: subData.config.waitForCompletion,
        };
        const nextEdges = outEdges.get(nodeId) ?? [];
        for (const e of nextEdges) queue.push(e.target);
        continue;
      }

      const nextEdges = outEdges.get(nodeId) ?? [];
      for (const e of nextEdges) queue.push(e.target);
    }

    await config.persistence.updateRun(runId, "completed", nodeOutputs);
    if (config.persistence.onWorkflowComplete) {
      await config.persistence.onWorkflowComplete(workflow.id);
    }

    return { runId, status: "completed", nodeOutputs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await config.persistence.updateRun(runId, "failed", nodeOutputs, errorMsg);
    return { runId, status: "failed", nodeOutputs, error: errorMsg };
  }
}

// ── Internal helpers ────────────────────────────────────────────

/**
 * Classify an error into a category for retry filtering.
 * Prefers structured errorType from ActionResult; falls back to string heuristics.
 */
function classifyError(error: string, structuredType?: string): string {
  if (structuredType && ["timeout", "rate_limit", "server", "auth", "validation", "unknown"].includes(structuredType)) {
    return structuredType;
  }
  const lower = error.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout") || lower.includes("aborted")) return "timeout";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "rate_limit";
  if (/\b(500|502|503|504)\b/.test(lower) || lower.includes("server error") || lower.includes("internal error")) return "server";
  if (/\b(401|403)\b/.test(lower) || lower.includes("forbidden") || lower.includes("unauthorized")) return "auth";
  if (lower.includes("invalid") || lower.includes("missing required")) return "validation";
  return "unknown";
}

async function executeActionWithRetry(
  actionType: string,
  config: Record<string, unknown>,
  ctx: ActionContext,
  engineConfig: EngineConfig,
  nodeRetryConfig?: NodeRetryConfig
): Promise<ActionResult> {
  // Dry-run: skip actual execution, return simulated success
  if (engineConfig.dryRun) {
    return {
      success: true,
      output: { dryRun: true, actionType, config, skipped: true },
    };
  }

  const maxRetries = nodeRetryConfig?.maxRetries ?? engineConfig.maxRetries ?? 2;
  const baseDelay = nodeRetryConfig?.retryDelay; // undefined = use exponential backoff
  const retryOnTypes = nodeRetryConfig?.retryOn; // undefined = retry all transient errors
  let lastResult: ActionResult = { success: false, error: "Unknown action" };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await engineConfig.executeAction(actionType, config, ctx);
    if (lastResult.success) return lastResult;

    const err = lastResult.error ?? "";
    const errorType = classifyError(err, lastResult.errorType);

    // Never retry auth/validation errors
    if (errorType === "validation" || errorType === "auth") break;

    // If retryOn is specified, only retry matching error types
    if (retryOnTypes && retryOnTypes.length > 0 && !retryOnTypes.includes(errorType)) break;

    if (attempt < maxRetries) {
      // Exponential backoff with jitter; baseDelay overrides to fixed delay
      const jitter = Math.random() * 1000;
      const delay = baseDelay ?? Math.min((2 ** attempt) * 1000 + jitter, 60000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return lastResult;
}

/**
 * Evaluate a condition node against the current context vars.
 */
export function evaluateCondition(
  data: ConditionNodeData,
  ctx: ActionContext
): boolean {
  const config = data.config;

  if (config.conditions && config.conditions.length > 0) {
    const results = config.conditions.map((c) =>
      evalSingleCondition(c.field, c.operator, c.value, ctx)
    );
    return config.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  }

  return evalSingleCondition(config.field, config.operator, config.value, ctx);
}

function evalSingleCondition(
  field: string,
  operator: string,
  value: string,
  ctx: ActionContext
): boolean {
  const actual = String(ctx.vars[field] ?? "");
  const expected = value;

  switch (operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains": return !actual.toLowerCase().includes(expected.toLowerCase());
    case "starts_with": return actual.toLowerCase().startsWith(expected.toLowerCase());
    case "gt": return Number(actual) > Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "is_empty": return actual === "" || actual === "undefined";
    case "is_not_empty": return actual !== "" && actual !== "undefined";
    default: return false;
  }
}
