import { NodeRegistry, NodePaletteItem, WorkflowNodeData } from './engine.js';
export { ActionContext, ActionExecutor, ActionNodeData, ActionResult, ConditionConfig, ConditionNodeData, ConditionOperator, ConfigFieldDef, DEFAULT_OPERATORS, DelayConfig, DelayNodeData, EngineConfig, FlowEdge, FlowNode, NodeTypeRegistration, PersistenceAdapter, RunResult, TriggerNodeData, WorkflowData, WorkflowEvent, defaultRenderTemplate, evaluateCondition, executeWorkflow, resumeWorkflow } from './engine.js';
import { ClassValue } from 'clsx';
import * as react_jsx_runtime from 'react/jsx-runtime';
import * as React from 'react';
import { Node, Edge, NodeTypes, NodeProps } from '@xyflow/react';

declare function cn(...inputs: ClassValue[]): string;

interface BuilderContextValue {
    registry: NodeRegistry;
    iconMap: Record<string, React.ElementType>;
    triggers: NodePaletteItem[];
    actions: NodePaletteItem[];
    logic: NodePaletteItem[];
}
declare function useBuilderContext(): BuilderContextValue;
interface BuilderProviderProps {
    registry: NodeRegistry;
    /** Map of icon name → React component. Used by node components. */
    iconMap?: Record<string, React.ElementType>;
    children: React.ReactNode;
}
declare function BuilderProvider({ registry, iconMap, children }: BuilderProviderProps): react_jsx_runtime.JSX.Element;

interface FlowCanvasProps {
    initialNodes: Node[];
    initialEdges: Edge[];
    onSave: (nodes: Node[], edges: Edge[]) => void;
    saving?: boolean;
    /** Auto-save debounce in ms. Default: 1000 */
    autoSaveDelay?: number;
    /** Custom node types to merge with defaults */
    customNodeTypes?: NodeTypes;
    /** Hide the node sidebar */
    hideSidebar?: boolean;
    /** Hide the config panel */
    hideConfigPanel?: boolean;
}
declare function FlowCanvas(props: FlowCanvasProps): react_jsx_runtime.JSX.Element;

interface NodeConfigPanelProps {
    node: Node;
    onDataChange: (nodeId: string, data: WorkflowNodeData) => void;
    onDelete: (nodeId: string) => void;
}
declare function NodeConfigPanel({ node, onDataChange, onDelete }: NodeConfigPanelProps): react_jsx_runtime.JSX.Element;

declare function NodeSidebar(): react_jsx_runtime.JSX.Element;

declare function TriggerNode({ data, selected }: NodeProps): react_jsx_runtime.JSX.Element;

declare function ActionNode({ data, selected }: NodeProps): react_jsx_runtime.JSX.Element;

declare function ConditionNode({ data, selected }: NodeProps): react_jsx_runtime.JSX.Element;

declare function DelayNode({ data, selected }: NodeProps): react_jsx_runtime.JSX.Element;

export { ActionNode, BuilderProvider, ConditionNode, DelayNode, FlowCanvas, NodeConfigPanel, NodePaletteItem, NodeRegistry, NodeSidebar, TriggerNode, WorkflowNodeData, cn, useBuilderContext };
