import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as React2 from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { Handle, Position, ReactFlowProvider, useNodesState, useEdgesState, addEdge, ReactFlow, Background, BackgroundVariant, Controls, MiniMap } from '@xyflow/react';
import { Command } from 'cmdk';

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

// src/core/types.ts
var DEFAULT_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "gt", label: "Greater Than" },
  { value: "lt", label: "Less Than" },
  { value: "gte", label: "Greater or Equal" },
  { value: "lte", label: "Less or Equal" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" }
];

// src/core/engine.ts
function defaultRenderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val == null ? "" : String(val);
  });
}
async function executeWorkflow(workflow, event, context, config) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s;
  const nodes = (_a = workflow.nodes) != null ? _a : [];
  const edges = (_b = workflow.edges) != null ? _b : [];
  if (nodes.length === 0) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow has no nodes" };
  }
  const runId = await config.persistence.createRun(workflow.id, event);
  const nodeOutputs = {};
  const outEdges = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const existing = (_c = outEdges.get(edge.source)) != null ? _c : [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }
  const actionCtx = __spreadValues({
    workflowId: workflow.id,
    runId,
    vars: (_d = context.vars) != null ? _d : {}
  }, context);
  const triggerNode = nodes.find((n) => n.type === "trigger");
  if (!triggerNode) {
    await config.persistence.updateRun(runId, "failed", nodeOutputs, "No trigger node found");
    return { runId, status: "failed", nodeOutputs, error: "No trigger node found" };
  }
  const incomingEdgeCount = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    incomingEdgeCount.set(edge.target, ((_e = incomingEdgeCount.get(edge.target)) != null ? _e : 0) + 1);
  }
  const mergeArrivalCount = /* @__PURE__ */ new Map();
  const queue = [triggerNode.id];
  const visited = /* @__PURE__ */ new Set();
  try {
    while (queue.length > 0) {
      const nodeId2 = queue.shift();
      const node = nodes.find((n) => n.id === nodeId2);
      if (!node) continue;
      if (node.data.nodeType === "merge") {
        const mergeData = node.data;
        const arrivals = ((_f = mergeArrivalCount.get(nodeId2)) != null ? _f : 0) + 1;
        mergeArrivalCount.set(nodeId2, arrivals);
        const totalIncoming = (_g = incomingEdgeCount.get(nodeId2)) != null ? _g : 1;
        if (mergeData.config.mode === "all") {
          if (arrivals < totalIncoming) continue;
        } else {
          if (visited.has(nodeId2)) continue;
        }
        visited.add(nodeId2);
        nodeOutputs[nodeId2] = { merge: true, mode: mergeData.config.mode, arrivals, totalIncoming };
        const nextEdges2 = (_h = outEdges.get(nodeId2)) != null ? _h : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (visited.has(nodeId2)) continue;
      visited.add(nodeId2);
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId2);
      const data = node.data;
      if (data.nodeType === "trigger") {
        nodeOutputs[nodeId2] = { type: "trigger", triggered: true };
        const nextEdges2 = (_i = outEdges.get(nodeId2)) != null ? _i : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "action") {
        const actionData = data;
        if (config.persistence.recordNodeStart) {
          await config.persistence.recordNodeStart(runId, nodeId2);
        }
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config,
          actionData.retryConfig
        );
        nodeOutputs[nodeId2] = result;
        const nextEdges2 = (_j = outEdges.get(nodeId2)) != null ? _j : [];
        if (!result.success) {
          console.error(`[automation-builder] Action node ${nodeId2} failed: ${result.error}`);
          actionCtx.vars.error_message = (_k = result.error) != null ? _k : "Unknown error";
          actionCtx.vars.failed_node = nodeId2;
          actionCtx.vars.failed_action = actionData.actionType;
          const errorEdges = nextEdges2.filter((e) => e.sourceHandle === "error");
          for (const e of errorEdges) queue.push(e.target);
          continue;
        }
        delete actionCtx.vars.error_message;
        delete actionCtx.vars.failed_node;
        delete actionCtx.vars.failed_action;
        const successEdges = nextEdges2.filter((e) => e.sourceHandle !== "error");
        for (const e of successEdges) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data, actionCtx);
        nodeOutputs[nodeId2] = { condition: condResult };
        const nextEdges2 = (_l = outEdges.get(nodeId2)) != null ? _l : [];
        const targetHandle = condResult ? "true" : "false";
        for (const e of nextEdges2) {
          if (e.sourceHandle === targetHandle) queue.push(e.target);
        }
        continue;
      }
      if (data.nodeType === "loop") {
        const loopData = data;
        const cfg = loopData.config;
        const renderFn = (_m = config.renderTemplate) != null ? _m : defaultRenderTemplate;
        let sourceArray;
        const rawSource = actionCtx.vars[cfg.sourceVariable];
        if (typeof rawSource === "string") {
          try {
            sourceArray = JSON.parse(rawSource);
          } catch (e) {
            sourceArray = [rawSource];
          }
        } else if (Array.isArray(rawSource)) {
          sourceArray = rawSource;
        } else {
          sourceArray = rawSource ? [rawSource] : [];
        }
        const maxIter = Math.min(cfg.maxIterations || 100, 1e3);
        sourceArray = sourceArray.slice(0, maxIter);
        const nextEdges2 = (_n = outEdges.get(nodeId2)) != null ? _n : [];
        const itemEdges = nextEdges2.filter((e) => e.sourceHandle === "item");
        const doneEdges = nextEdges2.filter((e) => e.sourceHandle === "done" || e.sourceHandle !== "item");
        const iterResults = [];
        let iterErrors = 0;
        for (let i = 0; i < sourceArray.length; i++) {
          const item = sourceArray[i];
          actionCtx.vars[cfg.itemVariable || "item"] = typeof item === "object" ? JSON.stringify(item) : String(item != null ? item : "");
          actionCtx.vars.loop_index = i;
          actionCtx.vars.loop_total = sourceArray.length;
          for (const edge of itemEdges) {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!targetNode) continue;
            const targetData = targetNode.data;
            if (targetData.nodeType === "action") {
              const actionData = targetData;
              const actionConfig = __spreadValues({}, actionData.config);
              for (const [k, v] of Object.entries(actionConfig)) {
                if (typeof v === "string") {
                  actionConfig[k] = renderFn(
                    v,
                    actionCtx.vars
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
              nodeOutputs[`${targetNode.id}_iter_${i}`] = __spreadProps(__spreadValues({}, result), { iteration: i, item });
              if (!result.success) {
                iterErrors++;
                if (!cfg.continueOnError) break;
              } else {
                iterResults.push(result.output);
              }
            } else if (targetData.nodeType === "condition") {
              const condResult = evaluateCondition(targetData, actionCtx);
              nodeOutputs[`${targetNode.id}_iter_${i}`] = { condition: condResult, iteration: i, item };
              const condHandle = condResult ? "true" : "false";
              const condEdges = (_o = outEdges.get(targetNode.id)) != null ? _o : [];
              for (const ce of condEdges) {
                if (ce.sourceHandle !== condHandle) continue;
                const branchNode = nodes.find((n) => n.id === ce.target);
                if (!branchNode || branchNode.data.nodeType !== "action") continue;
                const branchAction = branchNode.data;
                const branchConfig = __spreadValues({}, branchAction.config);
                for (const [k, v] of Object.entries(branchConfig)) {
                  if (typeof v === "string") {
                    branchConfig[k] = renderFn(
                      v,
                      actionCtx.vars
                    );
                  }
                }
                const branchResult = await executeActionWithRetry(
                  branchAction.actionType,
                  branchConfig,
                  actionCtx,
                  config,
                  branchAction.retryConfig
                );
                nodeOutputs[`${branchNode.id}_iter_${i}`] = __spreadProps(__spreadValues({}, branchResult), { iteration: i, item });
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
        nodeOutputs[nodeId2] = {
          success: true,
          iterations: sourceArray.length,
          completed: sourceArray.length - iterErrors,
          errors: iterErrors,
          results: iterResults
        };
        for (const edge of itemEdges) {
          visited.add(edge.target);
        }
        for (const e of doneEdges) {
          if (e.sourceHandle === "done" || !itemEdges.some((ie) => ie.id === e.id)) {
            queue.push(e.target);
          }
        }
        delete actionCtx.vars[cfg.itemVariable || "item"];
        delete actionCtx.vars.loop_index;
        delete actionCtx.vars.loop_total;
        continue;
      }
      if (data.nodeType === "delay") {
        const delayData = data;
        const cfg = delayData.config;
        let delayMs = cfg.duration * 60 * 1e3;
        if (cfg.unit === "hours") delayMs = cfg.duration * 60 * 60 * 1e3;
        if (cfg.unit === "days") delayMs = cfg.duration * 24 * 60 * 60 * 1e3;
        const resumeAt = new Date(Date.now() + delayMs).toISOString();
        nodeOutputs[nodeId2] = { delay: true, resumeAt, unit: cfg.unit, duration: cfg.duration };
        if (config.dryRun) {
          nodeOutputs[nodeId2].dryRun = true;
          const nextEdges3 = (_p = outEdges.get(nodeId2)) != null ? _p : [];
          for (const e of nextEdges3) queue.push(e.target);
          continue;
        }
        const nextEdges2 = (_q = outEdges.get(nodeId2)) != null ? _q : [];
        const nextNodeIds = nextEdges2.map((e) => e.target);
        await config.persistence.updateRun(
          runId,
          "paused",
          __spreadProps(__spreadValues({}, nodeOutputs), { _resume_targets: nextNodeIds, _resume_at: resumeAt }),
          void 0,
          nodeId2
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }
        return { runId, status: "paused", nodeOutputs };
      }
      if (data.nodeType === "subworkflow") {
        const subData = data;
        nodeOutputs[nodeId2] = {
          subworkflow: true,
          workflowId: subData.config.workflowId,
          passVars: subData.config.passVars !== false,
          waitForCompletion: subData.config.waitForCompletion
        };
        const nextEdges2 = (_r = outEdges.get(nodeId2)) != null ? _r : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      const nextEdges = (_s = outEdges.get(nodeId2)) != null ? _s : [];
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
async function resumeWorkflow(workflow, runId, resumeTargets, existingOutputs, event, context, config) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
  const nodes = (_a = workflow.nodes) != null ? _a : [];
  const edges = (_b = workflow.edges) != null ? _b : [];
  const nodeOutputs = __spreadValues({}, existingOutputs);
  delete nodeOutputs._resume_targets;
  delete nodeOutputs._resume_at;
  const outEdges = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const existing = (_c = outEdges.get(edge.source)) != null ? _c : [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }
  const actionCtx = __spreadValues({
    workflowId: workflow.id,
    runId,
    vars: (_d = context.vars) != null ? _d : {}
  }, context);
  await config.persistence.updateRun(runId, "running", nodeOutputs);
  const incomingEdgeCount = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    incomingEdgeCount.set(edge.target, ((_e = incomingEdgeCount.get(edge.target)) != null ? _e : 0) + 1);
  }
  const mergeArrivalCount = /* @__PURE__ */ new Map();
  const queue = [...resumeTargets];
  const visited = new Set(Object.keys(nodeOutputs));
  try {
    while (queue.length > 0) {
      const nodeId2 = queue.shift();
      const node = nodes.find((n) => n.id === nodeId2);
      if (!node) continue;
      if (node.data.nodeType === "merge") {
        const mergeData = node.data;
        const arrivals = ((_f = mergeArrivalCount.get(nodeId2)) != null ? _f : 0) + 1;
        mergeArrivalCount.set(nodeId2, arrivals);
        const totalIncoming = (_g = incomingEdgeCount.get(nodeId2)) != null ? _g : 1;
        if (mergeData.config.mode === "all") {
          if (arrivals < totalIncoming) continue;
        } else {
          if (visited.has(nodeId2)) continue;
        }
        visited.add(nodeId2);
        nodeOutputs[nodeId2] = { merge: true, mode: mergeData.config.mode, arrivals, totalIncoming };
        const nextEdges2 = (_h = outEdges.get(nodeId2)) != null ? _h : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (visited.has(nodeId2)) continue;
      visited.add(nodeId2);
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId2);
      const data = node.data;
      if (data.nodeType === "action") {
        const actionData = data;
        if (config.persistence.recordNodeStart) {
          await config.persistence.recordNodeStart(runId, nodeId2);
        }
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config,
          actionData.retryConfig
        );
        nodeOutputs[nodeId2] = result;
        const nextEdges2 = (_i = outEdges.get(nodeId2)) != null ? _i : [];
        if (!result.success) {
          actionCtx.vars.error_message = (_j = result.error) != null ? _j : "Unknown error";
          actionCtx.vars.failed_node = nodeId2;
          actionCtx.vars.failed_action = actionData.actionType;
          const errorEdges = nextEdges2.filter((e) => e.sourceHandle === "error");
          for (const e of errorEdges) queue.push(e.target);
          continue;
        }
        delete actionCtx.vars.error_message;
        delete actionCtx.vars.failed_node;
        delete actionCtx.vars.failed_action;
        const successEdges = nextEdges2.filter((e) => e.sourceHandle !== "error");
        for (const e of successEdges) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data, actionCtx);
        nodeOutputs[nodeId2] = { condition: condResult };
        const nextEdges2 = (_k = outEdges.get(nodeId2)) != null ? _k : [];
        const targetHandle = condResult ? "true" : "false";
        for (const e of nextEdges2) {
          if (e.sourceHandle === targetHandle) queue.push(e.target);
        }
        continue;
      }
      if (data.nodeType === "loop") {
        const loopData = data;
        const cfg = loopData.config;
        const renderFn = (_l = config.renderTemplate) != null ? _l : defaultRenderTemplate;
        let sourceArray;
        const rawSource = actionCtx.vars[cfg.sourceVariable];
        if (typeof rawSource === "string") {
          try {
            sourceArray = JSON.parse(rawSource);
          } catch (e) {
            sourceArray = [rawSource];
          }
        } else if (Array.isArray(rawSource)) {
          sourceArray = rawSource;
        } else {
          sourceArray = rawSource ? [rawSource] : [];
        }
        const maxIter = Math.min(cfg.maxIterations || 100, 1e3);
        sourceArray = sourceArray.slice(0, maxIter);
        const nextEdges2 = (_m = outEdges.get(nodeId2)) != null ? _m : [];
        const itemEdges = nextEdges2.filter((e) => e.sourceHandle === "item");
        const doneEdges = nextEdges2.filter((e) => e.sourceHandle === "done" || e.sourceHandle !== "item");
        const iterResults = [];
        let iterErrors = 0;
        for (let i = 0; i < sourceArray.length; i++) {
          const item = sourceArray[i];
          actionCtx.vars[cfg.itemVariable || "item"] = typeof item === "object" ? JSON.stringify(item) : String(item != null ? item : "");
          actionCtx.vars.loop_index = i;
          actionCtx.vars.loop_total = sourceArray.length;
          for (const edge of itemEdges) {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!targetNode) continue;
            const targetData = targetNode.data;
            if (targetData.nodeType === "action") {
              const actionData = targetData;
              const actionConfig = __spreadValues({}, actionData.config);
              for (const [k, v] of Object.entries(actionConfig)) {
                if (typeof v === "string") {
                  actionConfig[k] = renderFn(
                    v,
                    actionCtx.vars
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
              nodeOutputs[`${targetNode.id}_iter_${i}`] = __spreadProps(__spreadValues({}, result), { iteration: i, item });
              if (!result.success) {
                iterErrors++;
                if (!cfg.continueOnError) break;
              } else {
                iterResults.push(result.output);
              }
            } else if (targetData.nodeType === "condition") {
              const condResult = evaluateCondition(targetData, actionCtx);
              nodeOutputs[`${targetNode.id}_iter_${i}`] = { condition: condResult, iteration: i, item };
              const condHandle = condResult ? "true" : "false";
              const condEdges = (_n = outEdges.get(targetNode.id)) != null ? _n : [];
              for (const ce of condEdges) {
                if (ce.sourceHandle !== condHandle) continue;
                const branchNode = nodes.find((n) => n.id === ce.target);
                if (!branchNode || branchNode.data.nodeType !== "action") continue;
                const branchAction = branchNode.data;
                const branchConfig = __spreadValues({}, branchAction.config);
                for (const [k, v] of Object.entries(branchConfig)) {
                  if (typeof v === "string") {
                    branchConfig[k] = renderFn(
                      v,
                      actionCtx.vars
                    );
                  }
                }
                const branchResult = await executeActionWithRetry(
                  branchAction.actionType,
                  branchConfig,
                  actionCtx,
                  config,
                  branchAction.retryConfig
                );
                nodeOutputs[`${branchNode.id}_iter_${i}`] = __spreadProps(__spreadValues({}, branchResult), { iteration: i, item });
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
        nodeOutputs[nodeId2] = {
          success: true,
          iterations: sourceArray.length,
          completed: sourceArray.length - iterErrors,
          errors: iterErrors,
          results: iterResults
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
        const delayData = data;
        const cfg = delayData.config;
        let delayMs = cfg.duration * 60 * 1e3;
        if (cfg.unit === "hours") delayMs = cfg.duration * 60 * 60 * 1e3;
        if (cfg.unit === "days") delayMs = cfg.duration * 24 * 60 * 60 * 1e3;
        const resumeAt = new Date(Date.now() + delayMs).toISOString();
        nodeOutputs[nodeId2] = { delay: true, resumeAt };
        const nextEdges2 = (_o = outEdges.get(nodeId2)) != null ? _o : [];
        const nextNodeIds = nextEdges2.map((e) => e.target);
        await config.persistence.updateRun(
          runId,
          "paused",
          __spreadProps(__spreadValues({}, nodeOutputs), { _resume_targets: nextNodeIds, _resume_at: resumeAt }),
          void 0,
          nodeId2
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }
        return { runId, status: "paused", nodeOutputs };
      }
      if (data.nodeType === "subworkflow") {
        const subData = data;
        nodeOutputs[nodeId2] = {
          subworkflow: true,
          workflowId: subData.config.workflowId,
          passVars: subData.config.passVars !== false,
          waitForCompletion: subData.config.waitForCompletion
        };
        const nextEdges2 = (_p = outEdges.get(nodeId2)) != null ? _p : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      const nextEdges = (_q = outEdges.get(nodeId2)) != null ? _q : [];
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
function classifyError(error, structuredType) {
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
async function executeActionWithRetry(actionType, config, ctx, engineConfig, nodeRetryConfig) {
  var _a, _b, _c;
  if (engineConfig.dryRun) {
    return {
      success: true,
      output: { dryRun: true, actionType, config, skipped: true }
    };
  }
  const maxRetries = (_b = (_a = nodeRetryConfig == null ? void 0 : nodeRetryConfig.maxRetries) != null ? _a : engineConfig.maxRetries) != null ? _b : 2;
  const baseDelay = nodeRetryConfig == null ? void 0 : nodeRetryConfig.retryDelay;
  const retryOnTypes = nodeRetryConfig == null ? void 0 : nodeRetryConfig.retryOn;
  let lastResult = { success: false, error: "Unknown action" };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await engineConfig.executeAction(actionType, config, ctx);
    if (lastResult.success) return lastResult;
    const err = (_c = lastResult.error) != null ? _c : "";
    const errorType = classifyError(err, lastResult.errorType);
    if (errorType === "validation" || errorType === "auth") break;
    if (retryOnTypes && retryOnTypes.length > 0 && !retryOnTypes.includes(errorType)) break;
    if (attempt < maxRetries) {
      const jitter = Math.random() * 1e3;
      const delay = baseDelay != null ? baseDelay : Math.min(2 ** attempt * 1e3 + jitter, 6e4);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return lastResult;
}
function evaluateCondition(data, ctx) {
  const config = data.config;
  if (config.conditions && config.conditions.length > 0) {
    const results = config.conditions.map(
      (c) => evalSingleCondition(c.field, c.operator, c.value, ctx)
    );
    return config.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  }
  return evalSingleCondition(config.field, config.operator, config.value, ctx);
}
function evalSingleCondition(field, operator, value, ctx) {
  var _a;
  const actual = String((_a = ctx.vars[field]) != null ? _a : "");
  const expected = value;
  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains":
      return !actual.toLowerCase().includes(expected.toLowerCase());
    case "starts_with":
      return actual.toLowerCase().startsWith(expected.toLowerCase());
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "is_empty":
      return actual === "" || actual === "undefined";
    case "is_not_empty":
      return actual !== "" && actual !== "undefined";
    default:
      return false;
  }
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
var DEFAULT_LOGIC = [
  {
    type: "condition",
    subType: "condition",
    label: "Condition",
    description: "If/else branch",
    icon: "GitBranch",
    defaultConfig: { field: "", operator: "equals", value: "" }
  },
  {
    type: "delay",
    subType: "delay",
    label: "Delay",
    description: "Wait before continuing",
    icon: "Clock",
    defaultConfig: { duration: 1, unit: "hours" }
  }
];
var BuilderContext = React2.createContext(null);
function useBuilderContext() {
  const ctx = React2.useContext(BuilderContext);
  if (!ctx) {
    throw new Error("useBuilderContext must be used within <AutomationBuilder>");
  }
  return ctx;
}
function BuilderProvider({ registry, iconMap = {}, children }) {
  const value = React2.useMemo(
    () => {
      var _a;
      return {
        registry,
        iconMap,
        triggers: registry.triggers,
        actions: registry.actions,
        logic: (_a = registry.logic) != null ? _a : DEFAULT_LOGIC
      };
    },
    [registry, iconMap]
  );
  return /* @__PURE__ */ jsx(BuilderContext.Provider, { value, children });
}
function TriggerNode({ data, selected }) {
  const nodeData = data;
  const { iconMap } = useBuilderContext();
  const Icon = iconMap[nodeData.triggerType];
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-purple-400/60 shadow-lg shadow-purple-500/10" : "border-purple-500/20"
      ),
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ jsx("div", { className: "h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0", children: Icon && /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4 text-purple-400" }) }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Trigger" }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-purple-400/70 truncate", children: nodeData.triggerType.replace(/_/g, " ") })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "source",
            position: Position.Bottom,
            className: "!w-3 !h-3 !bg-purple-400 !border-2 !border-purple-900"
          }
        )
      ]
    }
  );
}
function ActionNode({ data, selected }) {
  const nodeData = data;
  const { iconMap } = useBuilderContext();
  const Icon = iconMap[nodeData.actionType];
  let summary = "";
  const cfg = nodeData.config;
  for (const val of Object.values(cfg)) {
    if (typeof val === "string" && val.length > 0) {
      summary = val.length > 40 ? val.slice(0, 40) + "\u2026" : val;
      break;
    }
  }
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-blue-400/60 shadow-lg shadow-blue-500/10" : "border-blue-500/20"
      ),
      children: [
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "target",
            position: Position.Top,
            className: "!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ jsx("div", { className: "h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0", children: Icon && /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4 text-blue-400" }) }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Action" }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-blue-400/70 truncate", children: nodeData.actionType.replace(/_/g, " ") })
          ] })
        ] }),
        summary && /* @__PURE__ */ jsx("p", { className: "mt-2 text-[10px] text-muted-foreground truncate", children: summary }),
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "source",
            position: Position.Bottom,
            className: "!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
          }
        )
      ]
    }
  );
}
function ConditionNode({ data, selected }) {
  const nodeData = data;
  const cfg = nodeData.config;
  const summary = cfg.field ? `${cfg.field} ${cfg.operator} ${cfg.value || "?"}` : "Configure condition\u2026";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-yellow-400/60 shadow-lg shadow-yellow-500/10" : "border-yellow-500/20"
      ),
      children: [
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "target",
            position: Position.Top,
            className: "!w-3 !h-3 !bg-yellow-400 !border-2 !border-yellow-900"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ jsx("div", { className: "h-8 w-8 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0", children: /* @__PURE__ */ jsxs("svg", { className: "h-4 w-4 text-yellow-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx("line", { x1: "6", y1: "3", x2: "6", y2: "15" }),
            /* @__PURE__ */ jsx("circle", { cx: "18", cy: "6", r: "3" }),
            /* @__PURE__ */ jsx("circle", { cx: "6", cy: "18", r: "3" }),
            /* @__PURE__ */ jsx("path", { d: "M18 9a9 9 0 0 1-9 9" })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Condition" }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-yellow-400/70", children: "If / Else" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-[10px] text-muted-foreground truncate", children: summary }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between mt-2 text-[9px] text-muted-foreground px-1", children: [
          /* @__PURE__ */ jsx("span", { className: "text-emerald-400", children: "True" }),
          /* @__PURE__ */ jsx("span", { className: "text-red-400", children: "False" })
        ] }),
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "source",
            position: Position.Bottom,
            id: "true",
            className: "!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-900",
            style: { left: "30%" }
          }
        ),
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "source",
            position: Position.Bottom,
            id: "false",
            className: "!w-3 !h-3 !bg-red-400 !border-2 !border-red-900",
            style: { left: "70%" }
          }
        )
      ]
    }
  );
}
function DelayNode({ data, selected }) {
  const nodeData = data;
  const cfg = nodeData.config;
  const summary = cfg.duration ? `Wait ${cfg.duration} ${cfg.unit}` : "Configure delay\u2026";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-gray-400/60 shadow-lg shadow-gray-500/10" : "border-white/10"
      ),
      children: [
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "target",
            position: Position.Top,
            className: "!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-900"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ jsx("div", { className: "h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0", children: /* @__PURE__ */ jsxs("svg", { className: "h-4 w-4 text-gray-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "10" }),
            /* @__PURE__ */ jsx("polyline", { points: "12 6 12 12 16 14" })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Delay" }),
            /* @__PURE__ */ jsx("p", { className: "text-[10px] text-muted-foreground truncate", children: summary })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          Handle,
          {
            type: "source",
            position: Position.Bottom,
            className: "!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-900"
          }
        )
      ]
    }
  );
}
function PaletteGroup({
  title,
  items,
  accentClass,
  iconMap
}) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx("p", { className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1", children: title }),
    items.map((item) => {
      var _a;
      const Icon = (_a = iconMap[item.icon]) != null ? _a : iconMap[item.subType];
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: "flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 cursor-grab hover:bg-white/[0.05] hover:border-white/10 transition-colors active:cursor-grabbing",
          draggable: true,
          onDragStart: (e) => {
            e.dataTransfer.setData(
              "application/reactflow",
              JSON.stringify({
                nodeType: item.type,
                subType: item.subType,
                label: item.label,
                defaultConfig: item.defaultConfig
              })
            );
            e.dataTransfer.effectAllowed = "move";
          },
          children: [
            /* @__PURE__ */ jsx("div", { className: `h-6 w-6 rounded flex items-center justify-center shrink-0 ${accentClass}`, children: Icon && /* @__PURE__ */ jsx(Icon, { className: "h-3 w-3" }) }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx("p", { className: "text-[11px] font-medium text-foreground truncate", children: item.label }),
              /* @__PURE__ */ jsx("p", { className: "text-[9px] text-muted-foreground/60 truncate", children: item.description })
            ] })
          ]
        },
        `${item.type}-${item.subType}`
      );
    })
  ] });
}
function NodeSidebar() {
  const { triggers, actions, logic, iconMap } = useBuilderContext();
  return /* @__PURE__ */ jsxs("div", { className: "w-52 shrink-0 border-r border-white/10 bg-white/[0.02] p-3 space-y-4 overflow-y-auto", children: [
    /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-foreground px-1", children: "Nodes" }),
    /* @__PURE__ */ jsx("p", { className: "text-[10px] text-muted-foreground/60 px-1", children: "Drag onto canvas" }),
    /* @__PURE__ */ jsx(
      PaletteGroup,
      {
        title: "Triggers",
        items: triggers,
        accentClass: "bg-purple-500/20 text-purple-400",
        iconMap
      }
    ),
    /* @__PURE__ */ jsx(
      PaletteGroup,
      {
        title: "Actions",
        items: actions,
        accentClass: "bg-blue-500/20 text-blue-400",
        iconMap
      }
    ),
    /* @__PURE__ */ jsx(
      PaletteGroup,
      {
        title: "Logic",
        items: logic,
        accentClass: "bg-yellow-500/20 text-yellow-400",
        iconMap
      }
    )
  ] });
}
function useAsyncOptions(field) {
  const [options, setOptions] = React2.useState([]);
  const [loading, setLoading] = React2.useState(true);
  const [error, setError] = React2.useState(null);
  const [fetchKey, setFetchKey] = React2.useState(0);
  React2.useEffect(() => {
    if (!field.optionsUrl) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(field.optionsUrl).then((res) => {
      if (!res.ok) {
        if (!cancelled) {
          setOptions([]);
          setLoading(false);
        }
        return null;
      }
      return res.json();
    }).then((data) => {
      var _a, _b, _c, _d, _e, _f;
      if (cancelled || !data) return;
      const items = (_f = (_e = (_d = (_c = (_b = (_a = data.data) != null ? _a : data.groups) != null ? _b : data.stages) != null ? _c : data.contacts) != null ? _d : data.channels) != null ? _e : data.users) != null ? _f : Array.isArray(data) ? data : [];
      const mapped = items.map((item) => {
        var _a2, _b2, _c2, _d2, _e2;
        if (field.mapOption) return field.mapOption(item);
        return {
          value: String((_b2 = (_a2 = item.id) != null ? _a2 : item.value) != null ? _b2 : ""),
          label: String((_e2 = (_d2 = (_c2 = item.name) != null ? _c2 : item.label) != null ? _d2 : item.id) != null ? _e2 : "")
        };
      });
      setOptions(mapped);
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        setError(String(err));
        setOptions([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [field.optionsUrl, fetchKey]);
  const refetch = React2.useCallback(() => setFetchKey((k) => k + 1), []);
  return { options, loading, error, refetch };
}
function useClickOutside(refs, handler) {
  React2.useEffect(() => {
    function onMouseDown(e) {
      const inside = refs.some((ref) => {
        var _a;
        return (_a = ref.current) == null ? void 0 : _a.contains(e.target);
      });
      if (!inside) handler();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [refs, handler]);
}
function ComboboxField({
  field,
  value,
  onChange
}) {
  var _a, _b, _c;
  const options = (_a = field.options) != null ? _a : [];
  const strVal = value == null ? "" : String(value);
  if (options.length < 5) {
    return /* @__PURE__ */ jsxs(
      "select",
      {
        value: strVal,
        onChange: (e) => onChange(e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-white/20",
        children: [
          /* @__PURE__ */ jsx("option", { value: "", children: (_b = field.placeholder) != null ? _b : "Select..." }),
          options.map((opt) => /* @__PURE__ */ jsx("option", { value: opt.value, children: opt.label }, opt.value))
        ]
      }
    );
  }
  return /* @__PURE__ */ jsx(
    ComboboxDropdown,
    {
      options,
      value: strVal,
      onChange: (v) => onChange(v),
      placeholder: (_c = field.placeholder) != null ? _c : "Select...",
      loading: false
    }
  );
}
function AsyncComboboxField({
  field,
  value,
  onChange
}) {
  var _a, _b;
  const { options, loading, error, refetch } = useAsyncOptions(field);
  const strVal = value == null ? "" : String(value);
  const [manualMode, setManualMode] = React2.useState(false);
  const [manualValue, setManualValue] = React2.useState(strVal);
  const [addMode, setAddMode] = React2.useState(false);
  const [newId, setNewId] = React2.useState("");
  const [newName, setNewName] = React2.useState("");
  const [saving, setSaving] = React2.useState(false);
  async function handleCreate() {
    var _a2;
    if (!field.createUrl || !newId.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      const keys = (_a2 = field.createFields) != null ? _a2 : { valueKey: "channel_id", labelKey: "channel_name" };
      await fetch(field.createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [keys.valueKey]: newId.trim(), [keys.labelKey]: newName.trim() })
      });
      onChange(newId.trim());
      setAddMode(false);
      setNewId("");
      setNewName("");
      refetch();
    } finally {
      setSaving(false);
    }
  }
  if (addMode && field.createUrl) {
    return /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: newId,
          onChange: (e) => setNewId(e.target.value),
          className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
          placeholder: "ID (e.g. C06CTNC7LKU)",
          autoFocus: true
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          value: newName,
          onChange: (e) => setNewName(e.target.value),
          className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
          placeholder: "Display name",
          onKeyDown: (e) => e.key === "Enter" && handleCreate()
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-1.5", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: handleCreate,
            disabled: !newId.trim() || !newName.trim() || saving,
            className: "flex-1 rounded-lg bg-primary/20 text-primary text-[10px] py-1 hover:bg-primary/30 disabled:opacity-40 transition-colors",
            children: saving ? "Saving..." : "Add"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setAddMode(false),
            className: "rounded-lg bg-white/5 text-muted-foreground text-[10px] px-3 py-1 hover:bg-white/10 transition-colors",
            children: "Cancel"
          }
        )
      ] })
    ] });
  }
  if (manualMode || error && !loading) {
    return /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
      error && /* @__PURE__ */ jsx("p", { className: "text-[9px] text-yellow-400/70", children: "Could not load options \u2014 enter manually" }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-1", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: manualValue,
            onChange: (e) => {
              setManualValue(e.target.value);
              onChange(e.target.value);
            },
            className: "flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
            placeholder: (_a = field.placeholder) != null ? _a : "Enter value..."
          }
        ),
        !error && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setManualMode(false),
            className: "text-[9px] text-muted-foreground hover:text-foreground px-1.5",
            children: "List"
          }
        )
      ] })
    ] });
  }
  return /* @__PURE__ */ jsx(
    ComboboxDropdown,
    {
      options,
      value: strVal,
      onChange: (v) => {
        onChange(v);
        const opt = options.find((o) => o.value === v);
        if (opt && field.onSelectExtra) field.onSelectExtra(opt);
      },
      placeholder: (_b = field.placeholder) != null ? _b : "Select...",
      loading,
      onManual: () => {
        setManualMode(true);
        setManualValue(strVal);
      },
      onAdd: field.createUrl ? () => setAddMode(true) : void 0
    }
  );
}
function MultiSelectField({
  field,
  value,
  onChange
}) {
  var _a, _b;
  const options = (_a = field.options) != null ? _a : [];
  const selected = Array.isArray(value) ? value : [];
  return /* @__PURE__ */ jsx(
    MultiComboboxDropdown,
    {
      options,
      value: selected,
      onChange,
      placeholder: (_b = field.placeholder) != null ? _b : "Select...",
      loading: false
    }
  );
}
function AsyncMultiSelectField({
  field,
  value,
  onChange
}) {
  var _a;
  const { options, loading } = useAsyncOptions(field);
  const selected = Array.isArray(value) ? value : [];
  return /* @__PURE__ */ jsx(
    MultiComboboxDropdown,
    {
      options,
      value: selected,
      onChange,
      placeholder: (_a = field.placeholder) != null ? _a : "Select...",
      loading
    }
  );
}
function ComboboxDropdown({
  options,
  value,
  onChange,
  placeholder,
  loading,
  onManual,
  onAdd
}) {
  var _a;
  const [open, setOpen] = React2.useState(false);
  const [search, setSearch] = React2.useState("");
  const triggerRef = React2.useRef(null);
  const dropdownRef = React2.useRef(null);
  useClickOutside([triggerRef, dropdownRef], () => setOpen(false));
  const selectedLabel = (_a = options.find((o) => o.value === value)) == null ? void 0 : _a.label;
  if (loading) {
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/50 border border-white/10 rounded-lg h-8", children: [
      /* @__PURE__ */ jsx("svg", { className: "h-3 w-3 animate-spin", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ jsx("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }) }),
      "Loading..."
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        ref: triggerRef,
        type: "button",
        onClick: () => {
          setOpen(!open);
          setSearch("");
        },
        className: "w-full flex items-center justify-between rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none hover:border-white/20 transition-colors text-left",
        children: [
          /* @__PURE__ */ jsx("span", { className: selectedLabel ? "text-foreground truncate" : "text-muted-foreground/50 truncate", children: selectedLabel != null ? selectedLabel : placeholder }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 shrink-0", children: [
            value && /* @__PURE__ */ jsx(
              "span",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onChange("");
                },
                className: "text-muted-foreground/40 hover:text-foreground cursor-pointer",
                children: /* @__PURE__ */ jsx("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ jsx("path", { d: "M18 6 6 18M6 6l12 12" }) })
              }
            ),
            /* @__PURE__ */ jsxs("svg", { className: "h-3 w-3 text-muted-foreground/40", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
              /* @__PURE__ */ jsx("path", { d: "m7 15 5 5 5-5" }),
              /* @__PURE__ */ jsx("path", { d: "m7 9 5-5 5 5" })
            ] })
          ] })
        ]
      }
    ),
    open && /* @__PURE__ */ jsx("div", { ref: dropdownRef, className: "mt-1 rounded-lg border border-white/20 bg-[hsl(220,20%,10%)] shadow-2xl shadow-black/60 overflow-hidden ring-1 ring-white/10", children: /* @__PURE__ */ jsxs(Command, { shouldFilter: false, children: [
      /* @__PURE__ */ jsx("div", { className: "px-2 py-1.5 border-b border-white/5", children: /* @__PURE__ */ jsx(
        Command.Input,
        {
          value: search,
          onValueChange: setSearch,
          placeholder: "Search...",
          className: "w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/40",
          autoFocus: true
        }
      ) }),
      /* @__PURE__ */ jsxs(Command.List, { className: "max-h-48 overflow-y-auto p-1", children: [
        /* @__PURE__ */ jsx(Command.Empty, { className: "px-3 py-2 text-[10px] text-muted-foreground/50", children: "No results found" }),
        options.filter((opt) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return opt.label.toLowerCase().includes(s) || opt.value.toLowerCase().includes(s);
        }).map((opt) => /* @__PURE__ */ jsxs(
          Command.Item,
          {
            value: opt.value,
            onSelect: () => {
              onChange(opt.value);
              setOpen(false);
            },
            className: "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-white/5 data-[selected=true]:bg-white/5 text-foreground",
            children: [
              /* @__PURE__ */ jsx("span", { className: "h-3 w-3 shrink-0 flex items-center justify-center", children: opt.value === value && /* @__PURE__ */ jsx("svg", { className: "h-3 w-3 text-primary", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ jsx("polyline", { points: "20 6 9 17 4 12" }) }) }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: opt.label })
            ]
          },
          opt.value
        ))
      ] }),
      (onAdd || onManual) && /* @__PURE__ */ jsxs("div", { className: "border-t border-white/5 p-1 space-y-0.5", children: [
        onAdd && /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => {
              setOpen(false);
              onAdd();
            },
            className: "w-full text-left px-2 py-1.5 rounded-md text-[10px] text-primary/70 hover:bg-primary/5 hover:text-primary flex items-center gap-1.5",
            children: [
              /* @__PURE__ */ jsx("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12h14" }) }),
              "Add new..."
            ]
          }
        ),
        onManual && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              setOpen(false);
              onManual();
            },
            className: "w-full text-left px-2 py-1.5 rounded-md text-[10px] text-muted-foreground/50 hover:bg-white/5 hover:text-muted-foreground",
            children: "Enter ID manually..."
          }
        )
      ] })
    ] }) })
  ] });
}
function MultiComboboxDropdown({
  options,
  value,
  onChange,
  placeholder,
  loading
}) {
  const [open, setOpen] = React2.useState(false);
  const [search, setSearch] = React2.useState("");
  const triggerRef = React2.useRef(null);
  const dropdownRef = React2.useRef(null);
  useClickOutside([triggerRef, dropdownRef], () => setOpen(false));
  function toggle(val) {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  }
  if (loading) {
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/50 border border-white/10 rounded-lg h-8", children: [
      /* @__PURE__ */ jsx("svg", { className: "h-3 w-3 animate-spin", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ jsx("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }) }),
      "Loading..."
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        ref: triggerRef,
        type: "button",
        onClick: () => {
          setOpen(!open);
          setSearch("");
        },
        className: "w-full flex items-center justify-between rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs min-h-[32px] outline-none hover:border-white/20 transition-colors text-left",
        children: [
          /* @__PURE__ */ jsx("span", { className: value.length > 0 ? "text-foreground" : "text-muted-foreground/50", children: value.length > 0 ? `${value.length} selected` : placeholder }),
          /* @__PURE__ */ jsxs("svg", { className: "h-3 w-3 text-muted-foreground/40 shrink-0", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
            /* @__PURE__ */ jsx("path", { d: "m7 15 5 5 5-5" }),
            /* @__PURE__ */ jsx("path", { d: "m7 9 5-5 5 5" })
          ] })
        ]
      }
    ),
    value.length > 0 && /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1 mt-1.5", children: value.map((v) => {
      var _a, _b;
      const label = (_b = (_a = options.find((o) => o.value === v)) == null ? void 0 : _a.label) != null ? _b : v;
      return /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] text-foreground", children: [
        label,
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => toggle(v), className: "text-muted-foreground/40 hover:text-foreground", children: /* @__PURE__ */ jsx("svg", { className: "h-2.5 w-2.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ jsx("path", { d: "M18 6 6 18M6 6l12 12" }) }) })
      ] }, v);
    }) }),
    open && /* @__PURE__ */ jsx("div", { ref: dropdownRef, className: "mt-1 rounded-lg border border-white/20 bg-[hsl(220,20%,10%)] shadow-2xl shadow-black/60 overflow-hidden ring-1 ring-white/10", children: /* @__PURE__ */ jsxs(Command, { shouldFilter: false, children: [
      /* @__PURE__ */ jsx("div", { className: "px-2 py-1.5 border-b border-white/5", children: /* @__PURE__ */ jsx(
        Command.Input,
        {
          value: search,
          onValueChange: setSearch,
          placeholder: "Search...",
          className: "w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/40",
          autoFocus: true
        }
      ) }),
      /* @__PURE__ */ jsxs(Command.List, { className: "max-h-48 overflow-y-auto p-1", children: [
        /* @__PURE__ */ jsx(Command.Empty, { className: "px-3 py-2 text-[10px] text-muted-foreground/50", children: "No results found" }),
        options.filter((opt) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return opt.label.toLowerCase().includes(s) || opt.value.toLowerCase().includes(s);
        }).map((opt) => /* @__PURE__ */ jsxs(
          Command.Item,
          {
            value: opt.value,
            onSelect: () => toggle(opt.value),
            className: "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-white/5 data-[selected=true]:bg-white/5 text-foreground",
            children: [
              /* @__PURE__ */ jsx("span", { className: "h-3 w-3 shrink-0 flex items-center justify-center rounded-sm border border-white/20", children: value.includes(opt.value) && /* @__PURE__ */ jsx("svg", { className: "h-2.5 w-2.5 text-primary", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: /* @__PURE__ */ jsx("polyline", { points: "20 6 9 17 4 12" }) }) }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: opt.label })
            ]
          },
          opt.value
        ))
      ] })
    ] }) })
  ] });
}
function NodeConfigPanel({ node, onDataChange, onDelete }) {
  var _a, _b, _c;
  const data = node.data;
  const { registry } = useBuilderContext();
  function update(partial) {
    onDataChange(node.id, __spreadValues(__spreadValues({}, data), partial));
  }
  function updateConfig(key, value) {
    onDataChange(node.id, __spreadProps(__spreadValues({}, data), {
      config: __spreadProps(__spreadValues({}, data.config), { [key]: value })
    }));
  }
  const accentMap = {
    trigger: "text-purple-400",
    action: "text-blue-400",
    condition: "text-yellow-400",
    delay: "text-gray-400"
  };
  let registration;
  if (data.nodeType === "trigger") {
    registration = (_a = registry.triggerConfigs) == null ? void 0 : _a[data.triggerType];
  } else if (data.nodeType === "action") {
    registration = (_b = registry.actionConfigs) == null ? void 0 : _b[data.actionType];
  }
  return /* @__PURE__ */ jsxs("div", { className: "w-72 shrink-0 border-l border-white/10 bg-white/[0.02] p-4 space-y-4 overflow-y-auto", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxs("p", { className: `text-xs font-semibold uppercase tracking-wider ${(_c = accentMap[data.nodeType]) != null ? _c : "text-foreground"}`, children: [
      data.nodeType,
      " Config"
    ] }) }),
    /* @__PURE__ */ jsx(Field, { label: "Label", children: /* @__PURE__ */ jsx(
      "input",
      {
        value: data.label,
        onChange: (e) => update({ label: e.target.value }),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
        placeholder: "Node label"
      }
    ) }),
    registration && /* @__PURE__ */ jsx(
      RegisteredConfig,
      {
        registration,
        config: data.config,
        updateConfig
      }
    ),
    data.nodeType === "condition" && /* @__PURE__ */ jsx(ConditionConfig, { data, updateConfig }),
    data.nodeType === "delay" && /* @__PURE__ */ jsx(DelayConfig, { data, updateConfig }),
    /* @__PURE__ */ jsx("div", { className: "pt-3 border-t border-white/10", children: /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => onDelete(node.id),
        className: "flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start text-xs px-3 py-1.5 rounded-lg transition-colors",
        children: [
          /* @__PURE__ */ jsxs("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx("polyline", { points: "3 6 5 6 21 6" }),
            /* @__PURE__ */ jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
          ] }),
          "Delete Node"
        ]
      }
    ) })
  ] });
}
function RegisteredConfig({
  registration,
  config,
  updateConfig
}) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    registration.infoText && /* @__PURE__ */ jsx("div", { className: "rounded-lg bg-white/5 border border-white/10 px-3 py-2", children: /* @__PURE__ */ jsx("p", { className: "text-[10px] text-muted-foreground", children: registration.infoText }) }),
    registration.configFields.map((field) => /* @__PURE__ */ jsx(
      ConfigField,
      {
        field,
        value: config[field.key],
        onChange: (v) => updateConfig(field.key, v)
      },
      field.key
    ))
  ] });
}
function ConfigField({
  field,
  value,
  onChange
}) {
  const strVal = value == null ? "" : String(value);
  if (field.type === "async_select") {
    return /* @__PURE__ */ jsx(Field, { label: field.label, children: /* @__PURE__ */ jsx(AsyncComboboxField, { field, value, onChange }) });
  }
  if (field.type === "async_multi_select") {
    return /* @__PURE__ */ jsx(Field, { label: field.label, children: /* @__PURE__ */ jsx(AsyncMultiSelectField, { field, value, onChange }) });
  }
  if (field.type === "multi_select" && field.options) {
    return /* @__PURE__ */ jsx(Field, { label: field.label, children: /* @__PURE__ */ jsx(MultiSelectField, { field, value, onChange }) });
  }
  if (field.type === "select" && field.options) {
    return /* @__PURE__ */ jsx(Field, { label: field.label, children: /* @__PURE__ */ jsx(ComboboxField, { field, value, onChange }) });
  }
  if (field.type === "textarea") {
    return /* @__PURE__ */ jsx(Field, { label: field.label, children: /* @__PURE__ */ jsx(
      "textarea",
      {
        value: strVal,
        onChange: (e) => onChange(e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs resize-none outline-none focus:border-white/20",
        rows: 4,
        placeholder: field.placeholder
      }
    ) });
  }
  if (field.type === "number") {
    return /* @__PURE__ */ jsx(Field, { label: field.label, children: /* @__PURE__ */ jsx(
      "input",
      {
        type: "number",
        value: strVal,
        onChange: (e) => onChange(Number(e.target.value)),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
        placeholder: field.placeholder
      }
    ) });
  }
  return /* @__PURE__ */ jsx(Field, { label: field.label, children: /* @__PURE__ */ jsx(
    "input",
    {
      value: strVal,
      onChange: (e) => onChange(e.target.value),
      className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
      placeholder: field.placeholder
    }
  ) });
}
function ConditionConfig({
  data,
  updateConfig
}) {
  var _a, _b, _c, _d;
  const { registry } = useBuilderContext();
  const fields = (_a = registry.conditionFields) != null ? _a : [
    { value: "status", label: "Status" },
    { value: "type", label: "Type" },
    { value: "value", label: "Value" }
  ];
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx("div", { className: "rounded-lg bg-yellow-500/5 border border-yellow-500/10 px-3 py-2", children: /* @__PURE__ */ jsx("p", { className: "text-[10px] text-yellow-400/80", children: "If / Else Branch" }) }),
    /* @__PURE__ */ jsx(Field, { label: "Field", children: /* @__PURE__ */ jsxs(
      "select",
      {
        value: (_b = data.config.field) != null ? _b : "",
        onChange: (e) => updateConfig("field", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none",
        children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Select field..." }),
          fields.map((f) => /* @__PURE__ */ jsx("option", { value: f.value, children: f.label }, f.value))
        ]
      }
    ) }),
    /* @__PURE__ */ jsx(Field, { label: "Operator", children: /* @__PURE__ */ jsx(
      "select",
      {
        value: (_c = data.config.operator) != null ? _c : "equals",
        onChange: (e) => updateConfig("operator", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none",
        children: DEFAULT_OPERATORS.map((op) => /* @__PURE__ */ jsx("option", { value: op.value, children: op.label }, op.value))
      }
    ) }),
    /* @__PURE__ */ jsx(Field, { label: "Value", children: /* @__PURE__ */ jsx(
      "input",
      {
        value: (_d = data.config.value) != null ? _d : "",
        onChange: (e) => updateConfig("value", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
        placeholder: "Compare value..."
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { className: "flex gap-2 text-[10px]", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx("span", { className: "h-2 w-2 rounded-full bg-emerald-400" }),
        " True path"
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx("span", { className: "h-2 w-2 rounded-full bg-red-400" }),
        " False path"
      ] })
    ] })
  ] });
}
function DelayConfig({
  data,
  updateConfig
}) {
  var _a, _b;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx("div", { className: "rounded-lg bg-white/5 border border-white/10 px-3 py-2", children: /* @__PURE__ */ jsx("p", { className: "text-[10px] text-muted-foreground", children: "Wait before continuing" }) }),
    /* @__PURE__ */ jsx(Field, { label: "Duration", children: /* @__PURE__ */ jsx(
      "input",
      {
        type: "number",
        value: String((_a = data.config.duration) != null ? _a : 1),
        onChange: (e) => updateConfig("duration", Number(e.target.value)),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
        min: 1
      }
    ) }),
    /* @__PURE__ */ jsx(Field, { label: "Unit", children: /* @__PURE__ */ jsxs(
      "select",
      {
        value: (_b = data.config.unit) != null ? _b : "hours",
        onChange: (e) => updateConfig("unit", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none",
        children: [
          /* @__PURE__ */ jsx("option", { value: "minutes", children: "Minutes" }),
          /* @__PURE__ */ jsx("option", { value: "hours", children: "Hours" }),
          /* @__PURE__ */ jsx("option", { value: "days", children: "Days" })
        ]
      }
    ) })
  ] });
}
function Field({ label, children }) {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
    /* @__PURE__ */ jsx("label", { className: "text-[10px] text-muted-foreground", children: label }),
    children
  ] });
}

// src/core/auto-layout.ts
var MIN_GAP_X = 30;
var MIN_GAP_Y = 40;
var ROW_THRESHOLD = 80;
var MAX_NODE_WIDTH = 300;
var DEFAULT_SIZES = {
  appNode: { w: 280, h: 130 },
  personaNode: { w: 240, h: 200 },
  competitorNode: { w: 220, h: 150 },
  actionNode: { w: 220, h: 170 },
  noteNode: { w: 220, h: 200 },
  triggerNode: { w: 220, h: 110 },
  conditionNode: { w: 220, h: 110 },
  transformNode: { w: 220, h: 110 },
  outputNode: { w: 220, h: 110 },
  llmNode: { w: 260, h: 220 },
  stepNode: { w: 280, h: 200 },
  consensusNode: { w: 260, h: 220 },
  affinityCategoryNode: { w: 220, h: 150 }
};
var DEFAULT_SIZE = { w: 220, h: 130 };
function getNodeRect(node, idx) {
  var _a, _b, _c, _d;
  const measured = node.measured;
  const fallback = (_b = DEFAULT_SIZES[(_a = node.type) != null ? _a : ""]) != null ? _b : DEFAULT_SIZE;
  return {
    idx,
    x: node.position.x,
    y: node.position.y,
    w: Math.min((_c = measured == null ? void 0 : measured.width) != null ? _c : fallback.w, MAX_NODE_WIDTH),
    h: (_d = measured == null ? void 0 : measured.height) != null ? _d : fallback.h
  };
}
function groupIntoRows(rects) {
  const sorted = [...rects].sort((a, b) => a.y - b.y);
  const rows = [];
  let currentRow = [];
  let rowY = -Infinity;
  for (const rect of sorted) {
    if (rect.y - rowY > ROW_THRESHOLD && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }
    if (currentRow.length === 0) rowY = rect.y;
    currentRow.push(rect);
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}
function spreadRow(row) {
  if (row.length <= 1) return;
  row.sort((a, b) => a.x - b.x);
  const avgY = Math.round(row.reduce((s, r) => s + r.y, 0) / row.length);
  for (const r of row) r.y = avgY;
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1];
    const curr = row[i];
    const minX = prev.x + prev.w + MIN_GAP_X;
    if (curr.x < minX) {
      curr.x = minX;
    }
  }
  const origPositions = row.map((r) => r.x);
  const origMid = (Math.min(...origPositions) + Math.max(...origPositions)) / 2;
  const currLeft = row[0].x;
  const currRight = row[row.length - 1].x + row[row.length - 1].w;
  const currMid = (currLeft + currRight) / 2;
  const shift = origMid - currMid;
  for (const r of row) r.x = Math.round(r.x + shift);
}
function spaceRows(rows) {
  for (let i = 1; i < rows.length; i++) {
    const prevRow = rows[i - 1];
    const currRow = rows[i];
    const prevBottom = Math.max(...prevRow.map((r) => r.y + r.h));
    const currTop = Math.min(...currRow.map((r) => r.y));
    const gap = currTop - prevBottom;
    if (gap < MIN_GAP_Y) {
      const shift = MIN_GAP_Y - gap;
      for (let j = i; j < rows.length; j++) {
        for (const r of rows[j]) r.y = Math.round(r.y + shift);
      }
    }
  }
}
function autoLayout(nodes) {
  if (nodes.length <= 1) return nodes;
  const rects = nodes.map((n, i) => getNodeRect(n, i));
  const rows = groupIntoRows(rects);
  for (const row of rows) spreadRow(row);
  spaceRows(rows);
  const positions = /* @__PURE__ */ new Map();
  for (const row of rows) {
    for (const r of row) {
      positions.set(r.idx, { x: r.x, y: r.y });
    }
  }
  return nodes.map((node, i) => {
    const pos = positions.get(i);
    return pos ? __spreadProps(__spreadValues({}, node), { position: { x: pos.x, y: pos.y } }) : node;
  });
}
var nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode
};
var nodeId = 0;
function getNodeId() {
  return `node_${++nodeId}_${Date.now()}`;
}
function FlowCanvasInner({
  initialNodes,
  initialEdges,
  onSave,
  saving,
  autoSaveDelay = 1e3,
  customNodeTypes,
  hideSidebar,
  hideConfigPanel
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(autoLayout(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = React2.useState(null);
  const reactFlowWrapper = React2.useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = React2.useState(null);
  const mergedNodeTypes = React2.useMemo(
    () => __spreadValues(__spreadValues({}, nodeTypes), customNodeTypes),
    [customNodeTypes]
  );
  const saveTimeoutRef = React2.useRef(null);
  const nodesRef = React2.useRef(nodes);
  const edgesRef = React2.useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  React2.useEffect(() => {
    window.__supracrm_canvas_state = { nodes, edges };
  }, [nodes, edges]);
  const triggerSave = React2.useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onSave(nodesRef.current, edgesRef.current);
    }, autoSaveDelay);
  }, [onSave, autoSaveDelay]);
  React2.useEffect(() => {
    if (nodes === initialNodes && edges === initialEdges) return;
    triggerSave();
  }, [nodes, edges, triggerSave, initialNodes, initialEdges]);
  const onConnect = React2.useCallback(
    (connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;
      if (targetNode.type === "trigger") return;
      const edge = __spreadProps(__spreadValues({}, connection), {
        id: `edge_${connection.source}_${connection.target}_${Date.now()}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }
      });
      setEdges((eds) => addEdge(edge, eds));
    },
    [nodes, setEdges]
  );
  const onDragOver = React2.useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);
  const onDrop = React2.useCallback(
    (event) => {
      var _a;
      event.preventDefault();
      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;
      const { nodeType, subType, label, defaultConfig } = JSON.parse(rawData);
      const bounds = (_a = reactFlowWrapper.current) == null ? void 0 : _a.getBoundingClientRect();
      if (!bounds || !reactFlowInstance) return;
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      });
      let data;
      if (nodeType === "trigger") {
        data = { nodeType: "trigger", triggerType: subType, label, config: defaultConfig };
      } else if (nodeType === "action") {
        data = { nodeType: "action", actionType: subType, label, config: defaultConfig };
      } else if (nodeType === "condition") {
        data = { nodeType: "condition", label, config: __spreadValues({ field: "", operator: "equals", value: "" }, defaultConfig) };
      } else {
        data = { nodeType: "delay", label, config: __spreadValues({ duration: 1, unit: "hours" }, defaultConfig) };
      }
      const newNode = {
        id: getNodeId(),
        type: nodeType,
        position,
        data
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );
  const onNodeClick = React2.useCallback((_event, node) => {
    setSelectedNode(node);
  }, []);
  const onPaneClick = React2.useCallback(() => {
    setSelectedNode(null);
  }, []);
  const onNodeDataChange = React2.useCallback(
    (nodeId2, newData) => {
      setNodes(
        (nds) => nds.map(
          (n) => n.id === nodeId2 ? __spreadProps(__spreadValues({}, n), { data: newData }) : n
        )
      );
      setSelectedNode(
        (prev) => (prev == null ? void 0 : prev.id) === nodeId2 ? __spreadProps(__spreadValues({}, prev), { data: newData }) : prev
      );
    },
    [setNodes]
  );
  const onDeleteNode = React2.useCallback(
    (nodeId2) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId2));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId2 && e.target !== nodeId2));
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );
  return /* @__PURE__ */ jsxs("div", { className: "flex h-full", children: [
    !hideSidebar && /* @__PURE__ */ jsx(NodeSidebar, {}),
    /* @__PURE__ */ jsx("div", { ref: reactFlowWrapper, className: "flex-1 h-full", children: /* @__PURE__ */ jsxs(
      ReactFlow,
      {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        onInit: (instance) => setReactFlowInstance(instance),
        onDrop,
        onDragOver,
        onNodeClick,
        onPaneClick,
        nodeTypes: mergedNodeTypes,
        colorMode: "dark",
        fitView: true,
        snapToGrid: true,
        snapGrid: [16, 16],
        defaultEdgeOptions: {
          type: "smoothstep",
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }
        },
        proOptions: { hideAttribution: true },
        children: [
          /* @__PURE__ */ jsx(Background, { variant: BackgroundVariant.Dots, gap: 16, size: 1, color: "rgba(255,255,255,0.05)" }),
          /* @__PURE__ */ jsx(
            Controls,
            {
              className: "!bg-white/[0.05] !border-white/10 !rounded-xl [&>button]:!bg-white/[0.05] [&>button]:!border-white/10 [&>button]:!text-white/60 [&>button:hover]:!bg-white/10"
            }
          ),
          /* @__PURE__ */ jsx(
            MiniMap,
            {
              className: "!bg-white/[0.03] !border-white/10 !rounded-xl",
              nodeColor: (node) => {
                switch (node.type) {
                  case "trigger":
                    return "rgba(168, 85, 247, 0.5)";
                  case "action":
                    return "rgba(59, 130, 246, 0.5)";
                  case "condition":
                    return "rgba(234, 179, 8, 0.5)";
                  case "delay":
                    return "rgba(156, 163, 175, 0.5)";
                  default:
                    return "rgba(255,255,255,0.1)";
                }
              }
            }
          )
        ]
      }
    ) }),
    !hideConfigPanel && selectedNode && /* @__PURE__ */ jsx(
      NodeConfigPanel,
      {
        node: selectedNode,
        onDataChange: onNodeDataChange,
        onDelete: onDeleteNode
      }
    ),
    saving && /* @__PURE__ */ jsx("div", { className: "absolute top-3 right-3 text-[10px] text-muted-foreground/50", children: "Saving\u2026" })
  ] });
}
function FlowCanvas(props) {
  return /* @__PURE__ */ jsx(ReactFlowProvider, { children: /* @__PURE__ */ jsx(FlowCanvasInner, __spreadValues({}, props)) });
}

export { ActionNode, BuilderProvider, ConditionNode, DEFAULT_OPERATORS, DelayNode, FlowCanvas, NodeConfigPanel, NodeSidebar, TriggerNode, cn, defaultRenderTemplate, evaluateCondition, executeWorkflow, resumeWorkflow, useBuilderContext };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map