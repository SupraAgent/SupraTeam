"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface CrmConditionNodeData {
  label: string;
  field: "board_type" | "stage" | "value" | "assigned_to" | "company" | "tags" | "lifecycle_stage" | "quality_score";
  operator: "equals" | "not_equals" | "contains" | "gt" | "lt" | "is_empty";
  value: string;
}

function getCrmConditionData(data: Record<string, unknown>): CrmConditionNodeData {
  return {
    label: (data.label as string) || "",
    field: (data.field as CrmConditionNodeData["field"]) || "stage",
    operator: (data.operator as CrmConditionNodeData["operator"]) || "equals",
    value: (data.value as string) || "",
  };
}

export const CrmConditionNode = React.memo(function CrmConditionNode({ data }: NodeProps) {
  const d = getCrmConditionData(data as Record<string, unknown>);

  return (
    <div className="rounded-xl border-2 border-yellow-500/40 bg-yellow-500/10 px-4 py-3 min-w-[180px] max-w-[240px]">
      <Handle type="target" position={Position.Left} className="!bg-yellow-400 !w-2.5 !h-2.5" />
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        className="!bg-emerald-400 !w-2.5 !h-2.5"
        style={{ top: "35%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        className="!bg-red-400 !w-2.5 !h-2.5"
        style={{ top: "65%" }}
      />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🔀</span>
        <span className="font-semibold text-sm text-foreground truncate">{d.label || "CRM Condition"}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
        CRM Condition
      </div>
      {d.field && (
        <div className="text-[11px] text-muted-foreground">
          {d.field} {d.operator} {d.value}
        </div>
      )}
      <div className="flex justify-between mt-1.5 text-[9px]">
        <span className="text-emerald-400">True</span>
        <span className="text-red-400">False</span>
      </div>
    </div>
  );
});
