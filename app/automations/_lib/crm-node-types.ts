/**
 * CRM Node Type Registry
 *
 * Maps CRM-specific node types to their React components.
 * Passed to WorkflowBuilder via customNodeTypes prop.
 * The builder package has zero knowledge of CRM — all CRM
 * integration lives here in the app layer.
 */

import { CrmTriggerNode } from "../_nodes/crm-trigger-node";
import { CrmActionNode } from "../_nodes/crm-action-node";
import { CrmConditionNode } from "../_nodes/crm-condition-node";
import { CrmLoopNode } from "../_nodes/crm-loop-node";
import { CrmMergeNode } from "../_nodes/crm-merge-node";
import { CrmSubworkflowNode } from "../_nodes/crm-subworkflow-node";
import type { NodeProps } from "@xyflow/react";
import type { ComponentType } from "react";

// The builder expects Record<string, ComponentType<unknown>> but React Flow
// node components are typed as ComponentType<NodeProps>. We use a typed
// intermediate to avoid losing type safety while satisfying the builder's API.
export const CRM_NODE_TYPES: Record<string, ComponentType<NodeProps>> = {
  crmTriggerNode: CrmTriggerNode,
  crmActionNode: CrmActionNode,
  crmConditionNode: CrmConditionNode,
  crmLoopNode: CrmLoopNode,
  crmMergeNode: CrmMergeNode,
  crmSubworkflowNode: CrmSubworkflowNode,
};
