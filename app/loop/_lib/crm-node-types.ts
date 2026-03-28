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
import type { ComponentType } from "react";

export const CRM_NODE_TYPES: Record<string, ComponentType<unknown>> = {
  crmTriggerNode: CrmTriggerNode as ComponentType<unknown>,
  crmActionNode: CrmActionNode as ComponentType<unknown>,
  crmConditionNode: CrmConditionNode as ComponentType<unknown>,
};
