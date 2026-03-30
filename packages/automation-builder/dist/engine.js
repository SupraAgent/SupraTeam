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
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
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
  const queue = [triggerNode.id];
  const visited = /* @__PURE__ */ new Set();
  try {
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId);
      const data = node.data;
      if (data.nodeType === "trigger") {
        nodeOutputs[nodeId] = { type: "trigger", triggered: true };
        const nextEdges2 = (_e = outEdges.get(nodeId)) != null ? _e : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "action") {
        const actionData = data;
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config
        );
        nodeOutputs[nodeId] = result;
        if (!result.success) {
          console.error(`[automation-builder] Action node ${nodeId} failed: ${result.error}`);
          continue;
        }
        const nextEdges2 = (_f = outEdges.get(nodeId)) != null ? _f : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data, actionCtx);
        nodeOutputs[nodeId] = { condition: condResult };
        const nextEdges2 = (_g = outEdges.get(nodeId)) != null ? _g : [];
        const targetHandle = condResult ? "true" : "false";
        for (const e of nextEdges2) {
          if (e.sourceHandle === targetHandle) queue.push(e.target);
        }
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
          const nextEdges3 = (_h = outEdges.get(nodeId)) != null ? _h : [];
          for (const e of nextEdges3) queue.push(e.target);
          continue;
        }
        const nextEdges2 = (_i = outEdges.get(nodeId)) != null ? _i : [];
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
      const nextEdges = (_j = outEdges.get(nodeId)) != null ? _j : [];
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
  var _a, _b, _c, _d, _e, _f, _g, _h;
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
  const queue = [...resumeTargets];
  const visited = new Set(Object.keys(nodeOutputs));
  try {
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId);
      const data = node.data;
      if (data.nodeType === "action") {
        const actionData = data;
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config
        );
        nodeOutputs[nodeId] = result;
        if (!result.success) continue;
        const nextEdges2 = (_e = outEdges.get(nodeId)) != null ? _e : [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data, actionCtx);
        nodeOutputs[nodeId] = { condition: condResult };
        const nextEdges2 = (_f = outEdges.get(nodeId)) != null ? _f : [];
        const targetHandle = condResult ? "true" : "false";
        for (const e of nextEdges2) {
          if (e.sourceHandle === targetHandle) queue.push(e.target);
        }
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
        const nextEdges2 = (_g = outEdges.get(nodeId)) != null ? _g : [];
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
      const nextEdges = (_h = outEdges.get(nodeId)) != null ? _h : [];
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
async function executeActionWithRetry(actionType, config, ctx, engineConfig) {
  var _a, _b;
  if (engineConfig.dryRun) {
    return {
      success: true,
      output: { dryRun: true, actionType, config, skipped: true }
    };
  }
  const maxRetries = (_a = engineConfig.maxRetries) != null ? _a : 2;
  let lastResult = { success: false, error: "Unknown action" };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await engineConfig.executeAction(actionType, config, ctx);
    if (lastResult.success) return lastResult;
    const err = (_b = lastResult.error) != null ? _b : "";
    if (err.includes("not found") || err.includes("No ") || err.includes("Invalid") || err.includes("Unknown")) {
      break;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1e3 + 1e3));
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