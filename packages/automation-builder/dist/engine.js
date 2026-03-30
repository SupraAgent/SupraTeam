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
      const nodeId = queue.shift();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      if (node.data.nodeType === "merge") {
        const mergeData = node.data;
        const arrivals = ((_f = mergeArrivalCount.get(nodeId)) != null ? _f : 0) + 1;
        mergeArrivalCount.set(nodeId, arrivals);
        const totalIncoming = (_g = incomingEdgeCount.get(nodeId)) != null ? _g : 1;
        if (mergeData.config.mode === "all") {
          if (arrivals < totalIncoming) continue;
        } else {
          if (visited.has(nodeId)) continue;
        }
        visited.add(nodeId);
        nodeOutputs[nodeId] = { merge: true, mode: mergeData.config.mode, arrivals, totalIncoming };
        const nextEdges2 = (_h = outEdges.get(nodeId)) != null ? _h : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId);
      const data = node.data;
      if (data.nodeType === "trigger") {
        nodeOutputs[nodeId] = { type: "trigger", triggered: true };
        const nextEdges2 = (_i = outEdges.get(nodeId)) != null ? _i : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "action") {
        const actionData = data;
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
        const nextEdges2 = (_j = outEdges.get(nodeId)) != null ? _j : [];
        if (!result.success) {
          console.error(`[automation-builder] Action node ${nodeId} failed: ${result.error}`);
          actionCtx.vars.error_message = (_k = result.error) != null ? _k : "Unknown error";
          actionCtx.vars.failed_node = nodeId;
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
        nodeOutputs[nodeId] = { condition: condResult };
        const nextEdges2 = (_l = outEdges.get(nodeId)) != null ? _l : [];
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
        const nextEdges2 = (_n = outEdges.get(nodeId)) != null ? _n : [];
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
        nodeOutputs[nodeId] = {
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
        nodeOutputs[nodeId] = { delay: true, resumeAt, unit: cfg.unit, duration: cfg.duration };
        if (config.dryRun) {
          nodeOutputs[nodeId].dryRun = true;
          const nextEdges3 = (_p = outEdges.get(nodeId)) != null ? _p : [];
          for (const e of nextEdges3) queue.push(e.target);
          continue;
        }
        const nextEdges2 = (_q = outEdges.get(nodeId)) != null ? _q : [];
        const nextNodeIds = nextEdges2.map((e) => e.target);
        await config.persistence.updateRun(
          runId,
          "paused",
          __spreadProps(__spreadValues({}, nodeOutputs), { _resume_targets: nextNodeIds, _resume_at: resumeAt }),
          void 0,
          nodeId
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }
        return { runId, status: "paused", nodeOutputs };
      }
      if (data.nodeType === "subworkflow") {
        const subData = data;
        nodeOutputs[nodeId] = {
          subworkflow: true,
          workflowId: subData.config.workflowId,
          passVars: subData.config.passVars !== false,
          waitForCompletion: subData.config.waitForCompletion
        };
        const nextEdges2 = (_r = outEdges.get(nodeId)) != null ? _r : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      const nextEdges = (_s = outEdges.get(nodeId)) != null ? _s : [];
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
      const nodeId = queue.shift();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      if (node.data.nodeType === "merge") {
        const mergeData = node.data;
        const arrivals = ((_f = mergeArrivalCount.get(nodeId)) != null ? _f : 0) + 1;
        mergeArrivalCount.set(nodeId, arrivals);
        const totalIncoming = (_g = incomingEdgeCount.get(nodeId)) != null ? _g : 1;
        if (mergeData.config.mode === "all") {
          if (arrivals < totalIncoming) continue;
        } else {
          if (visited.has(nodeId)) continue;
        }
        visited.add(nodeId);
        nodeOutputs[nodeId] = { merge: true, mode: mergeData.config.mode, arrivals, totalIncoming };
        const nextEdges2 = (_h = outEdges.get(nodeId)) != null ? _h : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId);
      const data = node.data;
      if (data.nodeType === "action") {
        const actionData = data;
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
        const nextEdges2 = (_i = outEdges.get(nodeId)) != null ? _i : [];
        if (!result.success) {
          actionCtx.vars.error_message = (_j = result.error) != null ? _j : "Unknown error";
          actionCtx.vars.failed_node = nodeId;
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
        nodeOutputs[nodeId] = { condition: condResult };
        const nextEdges2 = (_k = outEdges.get(nodeId)) != null ? _k : [];
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
        const nextEdges2 = (_m = outEdges.get(nodeId)) != null ? _m : [];
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
        nodeOutputs[nodeId] = {
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
        nodeOutputs[nodeId] = { delay: true, resumeAt };
        const nextEdges2 = (_o = outEdges.get(nodeId)) != null ? _o : [];
        const nextNodeIds = nextEdges2.map((e) => e.target);
        await config.persistence.updateRun(
          runId,
          "paused",
          __spreadProps(__spreadValues({}, nodeOutputs), { _resume_targets: nextNodeIds, _resume_at: resumeAt }),
          void 0,
          nodeId
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }
        return { runId, status: "paused", nodeOutputs };
      }
      if (data.nodeType === "subworkflow") {
        const subData = data;
        nodeOutputs[nodeId] = {
          subworkflow: true,
          workflowId: subData.config.workflowId,
          passVars: subData.config.passVars !== false,
          waitForCompletion: subData.config.waitForCompletion
        };
        const nextEdges2 = (_p = outEdges.get(nodeId)) != null ? _p : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      const nextEdges = (_q = outEdges.get(nodeId)) != null ? _q : [];
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

export { DEFAULT_OPERATORS, defaultRenderTemplate, evaluateCondition, executeWorkflow, resumeWorkflow };
//# sourceMappingURL=engine.js.map
//# sourceMappingURL=engine.js.map