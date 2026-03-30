// Server-safe exports — no React dependencies
export {
  DEFAULT_OPERATORS,
  type ConfigFieldDef,
  type NodeRegistry,
  type NodeTypeRegistration,
  type NodePaletteItem,
  type WorkflowNodeData,
  type TriggerNodeData,
  type ActionNodeData,
  type ConditionNodeData,
  type DelayNodeData,
  type WorkflowData,
  type FlowNode,
  type FlowEdge,
  type WorkflowEvent,
  type ActionContext,
  type ActionResult,
  type ActionExecutor,
  type PersistenceAdapter,
  type RunResult,
  type ConditionOperator,
  type ConditionConfig,
  type DelayConfig,
} from "./core/types";

export { executeWorkflow, resumeWorkflow, evaluateCondition, defaultRenderTemplate, type EngineConfig } from "./core/engine";
