"use client";

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
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];
  if (nodes.length === 0) {
    return { runId: "", status: "failed", nodeOutputs: {}, error: "Workflow has no nodes" };
  }
  const runId = await config.persistence.createRun(workflow.id, event);
  const nodeOutputs = {};
  const outEdges = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }
  const actionCtx = {
    workflowId: workflow.id,
    runId,
    vars: context.vars ?? {},
    ...context
  };
  const triggerNode = nodes.find((n) => n.type === "trigger");
  if (!triggerNode) {
    await config.persistence.updateRun(runId, "failed", nodeOutputs, "No trigger node found");
    return { runId, status: "failed", nodeOutputs, error: "No trigger node found" };
  }
  const queue = [triggerNode.id];
  const visited = /* @__PURE__ */ new Set();
  try {
    while (queue.length > 0) {
      const nodeId2 = queue.shift();
      if (visited.has(nodeId2)) continue;
      visited.add(nodeId2);
      const node = nodes.find((n) => n.id === nodeId2);
      if (!node) continue;
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId2);
      const data = node.data;
      if (data.nodeType === "trigger") {
        nodeOutputs[nodeId2] = { type: "trigger", triggered: true };
        const nextEdges2 = outEdges.get(nodeId2) ?? [];
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
        nodeOutputs[nodeId2] = result;
        if (!result.success) {
          console.error(`[automation-builder] Action node ${nodeId2} failed: ${result.error}`);
        }
        const nextEdges2 = outEdges.get(nodeId2) ?? [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data, actionCtx);
        nodeOutputs[nodeId2] = { condition: condResult };
        const nextEdges2 = outEdges.get(nodeId2) ?? [];
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
        nodeOutputs[nodeId2] = { delay: true, resumeAt, unit: cfg.unit, duration: cfg.duration };
        const nextEdges2 = outEdges.get(nodeId2) ?? [];
        const nextNodeIds = nextEdges2.map((e) => e.target);
        await config.persistence.updateRun(
          runId,
          "paused",
          { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          void 0,
          nodeId2
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }
        return { runId, status: "paused", nodeOutputs };
      }
      const nextEdges = outEdges.get(nodeId2) ?? [];
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
  const nodes = workflow.nodes ?? [];
  const edges = workflow.edges ?? [];
  const nodeOutputs = { ...existingOutputs };
  delete nodeOutputs._resume_targets;
  delete nodeOutputs._resume_at;
  const outEdges = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const existing = outEdges.get(edge.source) ?? [];
    existing.push(edge);
    outEdges.set(edge.source, existing);
  }
  const actionCtx = {
    workflowId: workflow.id,
    runId,
    vars: context.vars ?? {},
    ...context
  };
  await config.persistence.updateRun(runId, "running", nodeOutputs);
  const queue = [...resumeTargets];
  const visited = new Set(Object.keys(nodeOutputs));
  try {
    while (queue.length > 0) {
      const nodeId2 = queue.shift();
      if (visited.has(nodeId2)) continue;
      visited.add(nodeId2);
      const node = nodes.find((n) => n.id === nodeId2);
      if (!node) continue;
      await config.persistence.updateRun(runId, "running", nodeOutputs, void 0, nodeId2);
      const data = node.data;
      if (data.nodeType === "action") {
        const actionData = data;
        const result = await executeActionWithRetry(
          actionData.actionType,
          actionData.config,
          actionCtx,
          config
        );
        nodeOutputs[nodeId2] = result;
        const nextEdges2 = outEdges.get(nodeId2) ?? [];
        for (const e of nextEdges2) queue.push(e.target);
        continue;
      }
      if (data.nodeType === "condition") {
        const condResult = evaluateCondition(data, actionCtx);
        nodeOutputs[nodeId2] = { condition: condResult };
        const nextEdges2 = outEdges.get(nodeId2) ?? [];
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
        nodeOutputs[nodeId2] = { delay: true, resumeAt };
        const nextEdges2 = outEdges.get(nodeId2) ?? [];
        const nextNodeIds = nextEdges2.map((e) => e.target);
        await config.persistence.updateRun(
          runId,
          "paused",
          { ...nodeOutputs, _resume_targets: nextNodeIds, _resume_at: resumeAt },
          void 0,
          nodeId2
        );
        if (config.persistence.scheduleResume) {
          await config.persistence.scheduleResume(runId, workflow.id, resumeAt, event);
        }
        return { runId, status: "paused", nodeOutputs };
      }
      const nextEdges = outEdges.get(nodeId2) ?? [];
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
  const maxRetries = engineConfig.maxRetries ?? 2;
  let lastResult = { success: false, error: "Unknown action" };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await engineConfig.executeAction(actionType, config, ctx);
    if (lastResult.success) return lastResult;
    const err = lastResult.error ?? "";
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
  const actual = String(ctx.vars[field] ?? "");
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

// src/core/utils.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// src/components/flow-canvas.tsx
import * as React2 from "react";
import {
  ReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider
} from "@xyflow/react";

// src/components/nodes/trigger-node.tsx
import { Handle, Position } from "@xyflow/react";

// src/components/builder-context.tsx
import * as React from "react";
import { jsx } from "react/jsx-runtime";
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
var BuilderContext = React.createContext(null);
function useBuilderContext() {
  const ctx = React.useContext(BuilderContext);
  if (!ctx) {
    throw new Error("useBuilderContext must be used within <AutomationBuilder>");
  }
  return ctx;
}
function BuilderProvider({ registry, iconMap = {}, children }) {
  const value = React.useMemo(
    () => ({
      registry,
      iconMap,
      triggers: registry.triggers,
      actions: registry.actions,
      logic: registry.logic ?? DEFAULT_LOGIC
    }),
    [registry, iconMap]
  );
  return /* @__PURE__ */ jsx(BuilderContext.Provider, { value, children });
}

// src/components/nodes/trigger-node.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
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
          /* @__PURE__ */ jsx2("div", { className: "h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0", children: Icon && /* @__PURE__ */ jsx2(Icon, { className: "h-4 w-4 text-purple-400" }) }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx2("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Trigger" }),
            /* @__PURE__ */ jsx2("p", { className: "text-[10px] text-purple-400/70 truncate", children: nodeData.triggerType.replace(/_/g, " ") })
          ] })
        ] }),
        /* @__PURE__ */ jsx2(
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

// src/components/nodes/action-node.tsx
import { Handle as Handle2, Position as Position2 } from "@xyflow/react";
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      className: cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-blue-400/60 shadow-lg shadow-blue-500/10" : "border-blue-500/20"
      ),
      children: [
        /* @__PURE__ */ jsx3(
          Handle2,
          {
            type: "target",
            position: Position2.Top,
            className: "!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
          }
        ),
        /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ jsx3("div", { className: "h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0", children: Icon && /* @__PURE__ */ jsx3(Icon, { className: "h-4 w-4 text-blue-400" }) }),
          /* @__PURE__ */ jsxs2("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx3("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Action" }),
            /* @__PURE__ */ jsx3("p", { className: "text-[10px] text-blue-400/70 truncate", children: nodeData.actionType.replace(/_/g, " ") })
          ] })
        ] }),
        summary && /* @__PURE__ */ jsx3("p", { className: "mt-2 text-[10px] text-muted-foreground truncate", children: summary }),
        /* @__PURE__ */ jsx3(
          Handle2,
          {
            type: "source",
            position: Position2.Bottom,
            className: "!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
          }
        )
      ]
    }
  );
}

// src/components/nodes/condition-node.tsx
import { Handle as Handle3, Position as Position3 } from "@xyflow/react";
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function ConditionNode({ data, selected }) {
  const nodeData = data;
  const cfg = nodeData.config;
  const summary = cfg.field ? `${cfg.field} ${cfg.operator} ${cfg.value || "?"}` : "Configure condition\u2026";
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      className: cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-yellow-400/60 shadow-lg shadow-yellow-500/10" : "border-yellow-500/20"
      ),
      children: [
        /* @__PURE__ */ jsx4(
          Handle3,
          {
            type: "target",
            position: Position3.Top,
            className: "!w-3 !h-3 !bg-yellow-400 !border-2 !border-yellow-900"
          }
        ),
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ jsx4("div", { className: "h-8 w-8 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0", children: /* @__PURE__ */ jsxs3("svg", { className: "h-4 w-4 text-yellow-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx4("line", { x1: "6", y1: "3", x2: "6", y2: "15" }),
            /* @__PURE__ */ jsx4("circle", { cx: "18", cy: "6", r: "3" }),
            /* @__PURE__ */ jsx4("circle", { cx: "6", cy: "18", r: "3" }),
            /* @__PURE__ */ jsx4("path", { d: "M18 9a9 9 0 0 1-9 9" })
          ] }) }),
          /* @__PURE__ */ jsxs3("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx4("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Condition" }),
            /* @__PURE__ */ jsx4("p", { className: "text-[10px] text-yellow-400/70", children: "If / Else" })
          ] })
        ] }),
        /* @__PURE__ */ jsx4("p", { className: "mt-2 text-[10px] text-muted-foreground truncate", children: summary }),
        /* @__PURE__ */ jsxs3("div", { className: "flex justify-between mt-2 text-[9px] text-muted-foreground px-1", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-emerald-400", children: "True" }),
          /* @__PURE__ */ jsx4("span", { className: "text-red-400", children: "False" })
        ] }),
        /* @__PURE__ */ jsx4(
          Handle3,
          {
            type: "source",
            position: Position3.Bottom,
            id: "true",
            className: "!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-900",
            style: { left: "30%" }
          }
        ),
        /* @__PURE__ */ jsx4(
          Handle3,
          {
            type: "source",
            position: Position3.Bottom,
            id: "false",
            className: "!w-3 !h-3 !bg-red-400 !border-2 !border-red-900",
            style: { left: "70%" }
          }
        )
      ]
    }
  );
}

// src/components/nodes/delay-node.tsx
import { Handle as Handle4, Position as Position4 } from "@xyflow/react";
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function DelayNode({ data, selected }) {
  const nodeData = data;
  const cfg = nodeData.config;
  const summary = cfg.duration ? `Wait ${cfg.duration} ${cfg.unit}` : "Configure delay\u2026";
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-gray-400/60 shadow-lg shadow-gray-500/10" : "border-white/10"
      ),
      children: [
        /* @__PURE__ */ jsx5(
          Handle4,
          {
            type: "target",
            position: Position4.Top,
            className: "!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-900"
          }
        ),
        /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ jsx5("div", { className: "h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0", children: /* @__PURE__ */ jsxs4("svg", { className: "h-4 w-4 text-gray-400", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx5("circle", { cx: "12", cy: "12", r: "10" }),
            /* @__PURE__ */ jsx5("polyline", { points: "12 6 12 12 16 14" })
          ] }) }),
          /* @__PURE__ */ jsxs4("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx5("p", { className: "text-xs font-medium text-foreground truncate", children: nodeData.label || "Delay" }),
            /* @__PURE__ */ jsx5("p", { className: "text-[10px] text-muted-foreground truncate", children: summary })
          ] })
        ] }),
        /* @__PURE__ */ jsx5(
          Handle4,
          {
            type: "source",
            position: Position4.Bottom,
            className: "!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-900"
          }
        )
      ]
    }
  );
}

// src/components/node-sidebar.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function PaletteGroup({
  title,
  items,
  accentClass,
  iconMap
}) {
  return /* @__PURE__ */ jsxs5("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsx6("p", { className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1", children: title }),
    items.map((item) => {
      const Icon = iconMap[item.icon] ?? iconMap[item.subType];
      return /* @__PURE__ */ jsxs5(
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
            /* @__PURE__ */ jsx6("div", { className: `h-6 w-6 rounded flex items-center justify-center shrink-0 ${accentClass}`, children: Icon && /* @__PURE__ */ jsx6(Icon, { className: "h-3 w-3" }) }),
            /* @__PURE__ */ jsxs5("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx6("p", { className: "text-[11px] font-medium text-foreground truncate", children: item.label }),
              /* @__PURE__ */ jsx6("p", { className: "text-[9px] text-muted-foreground/60 truncate", children: item.description })
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
  return /* @__PURE__ */ jsxs5("div", { className: "w-52 shrink-0 border-r border-white/10 bg-white/[0.02] p-3 space-y-4 overflow-y-auto", children: [
    /* @__PURE__ */ jsx6("p", { className: "text-xs font-semibold text-foreground px-1", children: "Nodes" }),
    /* @__PURE__ */ jsx6("p", { className: "text-[10px] text-muted-foreground/60 px-1", children: "Drag onto canvas" }),
    /* @__PURE__ */ jsx6(
      PaletteGroup,
      {
        title: "Triggers",
        items: triggers,
        accentClass: "bg-purple-500/20 text-purple-400",
        iconMap
      }
    ),
    /* @__PURE__ */ jsx6(
      PaletteGroup,
      {
        title: "Actions",
        items: actions,
        accentClass: "bg-blue-500/20 text-blue-400",
        iconMap
      }
    ),
    /* @__PURE__ */ jsx6(
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

// src/components/node-config-panel.tsx
import { jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function NodeConfigPanel({ node, onDataChange, onDelete }) {
  const data = node.data;
  const { registry } = useBuilderContext();
  function update(partial) {
    onDataChange(node.id, { ...data, ...partial });
  }
  function updateConfig(key, value) {
    onDataChange(node.id, {
      ...data,
      config: { ...data.config, [key]: value }
    });
  }
  const accentMap = {
    trigger: "text-purple-400",
    action: "text-blue-400",
    condition: "text-yellow-400",
    delay: "text-gray-400"
  };
  let registration;
  if (data.nodeType === "trigger") {
    registration = registry.triggerConfigs?.[data.triggerType];
  } else if (data.nodeType === "action") {
    registration = registry.actionConfigs?.[data.actionType];
  }
  return /* @__PURE__ */ jsxs6("div", { className: "w-72 shrink-0 border-l border-white/10 bg-white/[0.02] p-4 space-y-4 overflow-y-auto", children: [
    /* @__PURE__ */ jsx7("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxs6("p", { className: `text-xs font-semibold uppercase tracking-wider ${accentMap[data.nodeType] ?? "text-foreground"}`, children: [
      data.nodeType,
      " Config"
    ] }) }),
    /* @__PURE__ */ jsx7(Field, { label: "Label", children: /* @__PURE__ */ jsx7(
      "input",
      {
        value: data.label,
        onChange: (e) => update({ label: e.target.value }),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
        placeholder: "Node label"
      }
    ) }),
    registration && /* @__PURE__ */ jsx7(
      RegisteredConfig,
      {
        registration,
        config: data.config,
        updateConfig
      }
    ),
    data.nodeType === "condition" && /* @__PURE__ */ jsx7(ConditionConfig, { data, updateConfig }),
    data.nodeType === "delay" && /* @__PURE__ */ jsx7(DelayConfig, { data, updateConfig }),
    /* @__PURE__ */ jsx7("div", { className: "pt-3 border-t border-white/10", children: /* @__PURE__ */ jsxs6(
      "button",
      {
        onClick: () => onDelete(node.id),
        className: "flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start text-xs px-3 py-1.5 rounded-lg transition-colors",
        children: [
          /* @__PURE__ */ jsxs6("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx7("polyline", { points: "3 6 5 6 21 6" }),
            /* @__PURE__ */ jsx7("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
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
  return /* @__PURE__ */ jsxs6("div", { className: "space-y-3", children: [
    registration.infoText && /* @__PURE__ */ jsx7("div", { className: "rounded-lg bg-white/5 border border-white/10 px-3 py-2", children: /* @__PURE__ */ jsx7("p", { className: "text-[10px] text-muted-foreground", children: registration.infoText }) }),
    registration.configFields.map((field) => /* @__PURE__ */ jsx7(
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
  if (field.type === "textarea") {
    return /* @__PURE__ */ jsx7(Field, { label: field.label, children: /* @__PURE__ */ jsx7(
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
  if (field.type === "select" && field.options) {
    return /* @__PURE__ */ jsx7(Field, { label: field.label, children: /* @__PURE__ */ jsx7(
      "select",
      {
        value: strVal,
        onChange: (e) => onChange(e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none",
        children: field.options.map((opt) => /* @__PURE__ */ jsx7("option", { value: opt.value, children: opt.label }, opt.value))
      }
    ) });
  }
  if (field.type === "number") {
    return /* @__PURE__ */ jsx7(Field, { label: field.label, children: /* @__PURE__ */ jsx7(
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
  return /* @__PURE__ */ jsx7(Field, { label: field.label, children: /* @__PURE__ */ jsx7(
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
  const { registry } = useBuilderContext();
  const fields = registry.conditionFields ?? [
    { value: "status", label: "Status" },
    { value: "type", label: "Type" },
    { value: "value", label: "Value" }
  ];
  return /* @__PURE__ */ jsxs6("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx7("div", { className: "rounded-lg bg-yellow-500/5 border border-yellow-500/10 px-3 py-2", children: /* @__PURE__ */ jsx7("p", { className: "text-[10px] text-yellow-400/80", children: "If / Else Branch" }) }),
    /* @__PURE__ */ jsx7(Field, { label: "Field", children: /* @__PURE__ */ jsxs6(
      "select",
      {
        value: data.config.field ?? "",
        onChange: (e) => updateConfig("field", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none",
        children: [
          /* @__PURE__ */ jsx7("option", { value: "", children: "Select field\u2026" }),
          fields.map((f) => /* @__PURE__ */ jsx7("option", { value: f.value, children: f.label }, f.value))
        ]
      }
    ) }),
    /* @__PURE__ */ jsx7(Field, { label: "Operator", children: /* @__PURE__ */ jsx7(
      "select",
      {
        value: data.config.operator ?? "equals",
        onChange: (e) => updateConfig("operator", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none",
        children: DEFAULT_OPERATORS.map((op) => /* @__PURE__ */ jsx7("option", { value: op.value, children: op.label }, op.value))
      }
    ) }),
    /* @__PURE__ */ jsx7(Field, { label: "Value", children: /* @__PURE__ */ jsx7(
      "input",
      {
        value: data.config.value ?? "",
        onChange: (e) => updateConfig("value", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
        placeholder: "Compare value\u2026"
      }
    ) }),
    /* @__PURE__ */ jsxs6("div", { className: "flex gap-2 text-[10px]", children: [
      /* @__PURE__ */ jsxs6("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx7("span", { className: "h-2 w-2 rounded-full bg-emerald-400" }),
        " True path"
      ] }),
      /* @__PURE__ */ jsxs6("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx7("span", { className: "h-2 w-2 rounded-full bg-red-400" }),
        " False path"
      ] })
    ] })
  ] });
}
function DelayConfig({
  data,
  updateConfig
}) {
  return /* @__PURE__ */ jsxs6("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx7("div", { className: "rounded-lg bg-white/5 border border-white/10 px-3 py-2", children: /* @__PURE__ */ jsx7("p", { className: "text-[10px] text-muted-foreground", children: "Wait before continuing" }) }),
    /* @__PURE__ */ jsx7(Field, { label: "Duration", children: /* @__PURE__ */ jsx7(
      "input",
      {
        type: "number",
        value: String(data.config.duration ?? 1),
        onChange: (e) => updateConfig("duration", Number(e.target.value)),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20",
        min: 1
      }
    ) }),
    /* @__PURE__ */ jsx7(Field, { label: "Unit", children: /* @__PURE__ */ jsxs6(
      "select",
      {
        value: data.config.unit ?? "hours",
        onChange: (e) => updateConfig("unit", e.target.value),
        className: "w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none",
        children: [
          /* @__PURE__ */ jsx7("option", { value: "minutes", children: "Minutes" }),
          /* @__PURE__ */ jsx7("option", { value: "hours", children: "Hours" }),
          /* @__PURE__ */ jsx7("option", { value: "days", children: "Days" })
        ]
      }
    ) })
  ] });
}
function Field({ label, children }) {
  return /* @__PURE__ */ jsxs6("div", { className: "space-y-1", children: [
    /* @__PURE__ */ jsx7("label", { className: "text-[10px] text-muted-foreground", children: label }),
    children
  ] });
}

// src/components/flow-canvas.tsx
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
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
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = React2.useState(null);
  const reactFlowWrapper = React2.useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = React2.useState(null);
  const mergedNodeTypes = React2.useMemo(
    () => ({ ...nodeTypes, ...customNodeTypes }),
    [customNodeTypes]
  );
  const saveTimeoutRef = React2.useRef(null);
  const nodesRef = React2.useRef(nodes);
  const edgesRef = React2.useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
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
      const edge = {
        ...connection,
        id: `edge_${connection.source}_${connection.target}_${Date.now()}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 }
      };
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
      event.preventDefault();
      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;
      const { nodeType, subType, label, defaultConfig } = JSON.parse(rawData);
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
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
        data = { nodeType: "condition", label, config: { field: "", operator: "equals", value: "", ...defaultConfig } };
      } else {
        data = { nodeType: "delay", label, config: { duration: 1, unit: "hours", ...defaultConfig } };
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
          (n) => n.id === nodeId2 ? { ...n, data: newData } : n
        )
      );
      setSelectedNode(
        (prev) => prev?.id === nodeId2 ? { ...prev, data: newData } : prev
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
  return /* @__PURE__ */ jsxs7("div", { className: "flex h-full", children: [
    !hideSidebar && /* @__PURE__ */ jsx8(NodeSidebar, {}),
    /* @__PURE__ */ jsx8("div", { ref: reactFlowWrapper, className: "flex-1 h-full", children: /* @__PURE__ */ jsxs7(
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
          /* @__PURE__ */ jsx8(Background, { variant: BackgroundVariant.Dots, gap: 16, size: 1, color: "rgba(255,255,255,0.05)" }),
          /* @__PURE__ */ jsx8(
            Controls,
            {
              className: "!bg-white/[0.05] !border-white/10 !rounded-xl [&>button]:!bg-white/[0.05] [&>button]:!border-white/10 [&>button]:!text-white/60 [&>button:hover]:!bg-white/10"
            }
          ),
          /* @__PURE__ */ jsx8(
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
    !hideConfigPanel && selectedNode && /* @__PURE__ */ jsx8(
      NodeConfigPanel,
      {
        node: selectedNode,
        onDataChange: onNodeDataChange,
        onDelete: onDeleteNode
      }
    ),
    saving && /* @__PURE__ */ jsx8("div", { className: "absolute top-3 right-3 text-[10px] text-muted-foreground/50", children: "Saving\u2026" })
  ] });
}
function FlowCanvas(props) {
  return /* @__PURE__ */ jsx8(ReactFlowProvider, { children: /* @__PURE__ */ jsx8(FlowCanvasInner, { ...props }) });
}
export {
  ActionNode,
  BuilderProvider,
  ConditionNode,
  DEFAULT_OPERATORS,
  DelayNode,
  FlowCanvas,
  NodeConfigPanel,
  NodeSidebar,
  TriggerNode,
  cn,
  defaultRenderTemplate,
  evaluateCondition,
  executeWorkflow,
  resumeWorkflow,
  useBuilderContext
};
//# sourceMappingURL=index.js.map