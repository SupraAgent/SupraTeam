"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeExecutionOverlay } from "../_lib/execution-overlay";

export interface CrmSubworkflowNodeData {
  label: string;
  workflowId: string;
  workflowName?: string;
  passVars: boolean;
  waitForCompletion: boolean;
}

function getCrmSubworkflowData(data: Record<string, unknown>): CrmSubworkflowNodeData {
  return {
    label: (data.label as string) || "Sub-Workflow",
    workflowId: (data.workflowId as string) || "",
    workflowName: (data.workflowName as string) || "",
    passVars: data.passVars !== false,
    waitForCompletion: data.waitForCompletion !== false,
  };
}

export const CrmSubworkflowNode = React.memo(function CrmSubworkflowNode({ id, data }: NodeProps) {
  const d = getCrmSubworkflowData(data as Record<string, unknown>);

  return (
    <NodeExecutionOverlay nodeId={id}>
      <div className="rounded-xl border-2 border-indigo-500/40 bg-indigo-500/10 px-4 py-3 min-w-[180px] max-w-[240px]">
        <Handle type="target" position={Position.Left} className="!bg-indigo-400 !w-2.5 !h-2.5" />
        <Handle type="source" position={Position.Right} className="!bg-indigo-400 !w-2.5 !h-2.5" />
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">&#x1f517;</span>
          <span className="font-semibold text-sm text-foreground truncate">{d.label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
          Sub-Workflow
        </div>
        {(d.workflowName || d.workflowId) && (
          <div className="text-[11px] text-indigo-300/80 truncate">
            {d.workflowName || d.workflowId.slice(0, 8) + "..."}
          </div>
        )}
        <div className="flex gap-2 mt-1.5">
          {d.passVars && (
            <span className="text-[9px] text-indigo-400/60 bg-indigo-500/10 px-1 rounded">vars</span>
          )}
          <span className="text-[9px] text-indigo-400/60 bg-indigo-500/10 px-1 rounded">
            {d.waitForCompletion ? "sync" : "async"}
          </span>
        </div>
      </div>
    </NodeExecutionOverlay>
  );
});
