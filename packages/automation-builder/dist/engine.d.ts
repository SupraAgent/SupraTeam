/**
 * Core type definitions for the automation builder.
 * All types are generic — consuming apps provide their own
 * trigger/action types via the NodeRegistry plugin system.
 */
type WorkflowNodeType = "trigger" | "action" | "condition" | "delay";
interface TriggerNodeData {
    nodeType: "trigger";
    triggerType: string;
    label: string;
    config: Record<string, unknown>;
}
interface ActionNodeData {
    nodeType: "action";
    actionType: string;
    label: string;
    config: Record<string, unknown>;
}
interface ConditionOperator {
    value: string;
    label: string;
}
declare const DEFAULT_OPERATORS: ConditionOperator[];
interface ConditionConfig {
    field: string;
    operator: string;
    value: string;
    conditions?: {
        field: string;
        operator: string;
        value: string;
    }[];
    logic?: "and" | "or";
}
interface ConditionNodeData {
    nodeType: "condition";
    label: string;
    config: ConditionConfig;
}
interface DelayConfig {
    duration: number;
    unit: "minutes" | "hours" | "days";
}
interface DelayNodeData {
    nodeType: "delay";
    label: string;
    config: DelayConfig;
}
type WorkflowNodeData = TriggerNodeData | ActionNodeData | ConditionNodeData | DelayNodeData;
interface NodePaletteItem {
    type: WorkflowNodeType;
    subType: string;
    label: string;
    description: string;
    icon: string;
    defaultConfig: Record<string, unknown>;
}
/**
 * Config field definition for the config panel.
 * The builder renders form fields based on these definitions.
 */
interface ConfigFieldDef {
    key: string;
    label: string;
    type: "text" | "textarea" | "number" | "select" | "async_select" | "multi_select" | "async_multi_select";
    placeholder?: string;
    options?: {
        value: string;
        label: string;
    }[];
    defaultValue?: string | number | string[];
    /** URL to fetch options from (for async_select, async_multi_select) */
    optionsUrl?: string;
    /** Map raw API item to {value, label} */
    mapOption?: (item: Record<string, unknown>) => {
        value: string;
        label: string;
    };
    /** Callback when an option is selected */
    onSelectExtra?: (option: {
        value: string;
        label: string;
    }) => void;
    /** URL to POST new entries (enables "Add new..." in dropdown) */
    createUrl?: string;
    /** Map form input to POST body when creating new entries */
    createFields?: {
        valueKey: string;
        labelKey: string;
    };
}
/**
 * Registration for a custom trigger or action type.
 * Consumers provide these to define what config fields
 * appear in the config panel when a node of this type is selected.
 */
interface NodeTypeRegistration {
    /** Matches NodePaletteItem.subType */
    subType: string;
    /** Config fields to render in the panel */
    configFields: ConfigFieldDef[];
    /** Optional info text shown at top of config section */
    infoText?: string;
}
/**
 * Full registry provided by the consuming app.
 * Defines all available triggers, actions, and their config schemas.
 */
interface NodeRegistry {
    triggers: NodePaletteItem[];
    actions: NodePaletteItem[];
    logic?: NodePaletteItem[];
    /** Config field definitions per subType */
    triggerConfigs?: Record<string, NodeTypeRegistration>;
    actionConfigs?: Record<string, NodeTypeRegistration>;
    /** Condition field options (what fields can be compared) */
    conditionFields?: {
        value: string;
        label: string;
    }[];
}
interface WorkflowData {
    id: string;
    name: string;
    description?: string | null;
    nodes: FlowNode[];
    edges: FlowEdge[];
    is_active: boolean;
    trigger_type?: string | null;
    metadata?: Record<string, unknown>;
}
interface FlowNode {
    id: string;
    type: string;
    position: {
        x: number;
        y: number;
    };
    data: WorkflowNodeData;
}
interface FlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
}
interface WorkflowEvent {
    type: string;
    payload: Record<string, unknown>;
}
interface ActionContext {
    workflowId: string;
    runId: string;
    vars: Record<string, string | number | undefined>;
    [key: string]: unknown;
}
interface ActionResult {
    success: boolean;
    output?: Record<string, unknown>;
    error?: string;
}
/**
 * Action executor function — provided by consuming apps.
 * The engine calls this for each action node encountered during traversal.
 */
type ActionExecutor = (actionType: string, config: Record<string, unknown>, context: ActionContext) => Promise<ActionResult>;
/**
 * Persistence adapter — provided by consuming apps.
 * The engine uses this to create/update run records.
 */
interface PersistenceAdapter {
    createRun(workflowId: string, event: WorkflowEvent): Promise<string>;
    updateRun(runId: string, status: string, nodeOutputs: Record<string, unknown>, error?: string, currentNodeId?: string): Promise<void>;
    scheduleResume?(runId: string, workflowId: string, resumeAt: string, event: WorkflowEvent): Promise<void>;
    onWorkflowComplete?(workflowId: string): Promise<void>;
}
interface RunResult {
    runId: string;
    status: "completed" | "failed" | "paused";
    nodeOutputs: Record<string, unknown>;
    error?: string;
}

/**
 * Generic workflow execution engine.
 * BFS traversal of node/edge graph with pluggable action execution and persistence.
 * No database or app-specific dependencies.
 */

interface EngineConfig {
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
declare function defaultRenderTemplate(template: string, vars: Record<string, string | number | undefined>): string;
/**
 * Execute a workflow from its data.
 */
declare function executeWorkflow(workflow: WorkflowData, event: WorkflowEvent, context: Partial<ActionContext>, config: EngineConfig): Promise<RunResult>;
/**
 * Resume a paused workflow from stored resume targets.
 */
declare function resumeWorkflow(workflow: WorkflowData, runId: string, resumeTargets: string[], existingOutputs: Record<string, unknown>, event: WorkflowEvent, context: Partial<ActionContext>, config: EngineConfig): Promise<RunResult>;
/**
 * Evaluate a condition node against the current context vars.
 */
declare function evaluateCondition(data: ConditionNodeData, ctx: ActionContext): boolean;

export { type ActionContext, type ActionExecutor, type ActionNodeData, type ActionResult, type ConditionConfig, type ConditionNodeData, type ConditionOperator, type ConfigFieldDef, DEFAULT_OPERATORS, type DelayConfig, type DelayNodeData, type EngineConfig, type FlowEdge, type FlowNode, type NodePaletteItem, type NodeRegistry, type NodeTypeRegistration, type PersistenceAdapter, type RunResult, type TriggerNodeData, type WorkflowData, type WorkflowEvent, type WorkflowNodeData, defaultRenderTemplate, evaluateCondition, executeWorkflow, resumeWorkflow };
