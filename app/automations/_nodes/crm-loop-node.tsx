"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeExecutionOverlay } from "../_lib/execution-overlay";

export interface CrmLoopNodeData {
  label: string;
  sourceVariable: string;
  itemVariable: string;
  maxIterations: number;
  continueOnError: boolean;
}

function getCrmLoopData(data: Record<string, unknown>): CrmLoopNodeData {
  return {
    label: (data.label as string) || "Loop",
    sourceVariable: (data.sourceVariable as string) || "",
    itemVariable: (data.itemVariable as string) || "item",
    maxIterations: (data.maxIterations as number) || 100,
    continueOnError: data.continueOnError !== false,
  };
}

export const CrmLoopNode = React.memo(function CrmLoopNode({ id, data }: NodeProps) {
  const d = getCrmLoopData(data as Record<string, unknown>);

  return (
    <NodeExecutionOverlay nodeId={id}>
      <div className="rounded-xl border-2 border-rose-500/40 bg-rose-500/10 px-4 py-3 min-w-[180px] max-w-[240px]">
        <Handle type="target" position={Position.Left} className="!bg-rose-400 !w-2.5 !h-2.5" />
        <Handle
          type="source"
          position={Position.Right}
          id="item"
          className="!bg-amber-400 !w-2.5 !h-2.5"
          style={{ top: "35%" }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="done"
          className="!bg-emerald-400 !w-2.5 !h-2.5"
          style={{ top: "65%" }}
        />
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">&#x1f504;</span>
          <span className="font-semibold text-sm text-foreground truncate">{d.label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
          CRM Loop
        </div>
        {d.sourceVariable && (
          <div className="text-[11px] text-muted-foreground">
            each <span className="text-foreground/80 font-mono">{`{{${d.itemVariable}}}`}</span> in <span className="text-foreground/80 font-mono">{`{{${d.sourceVariable}}}`}</span>
          </div>
        )}
        <div className="flex justify-between mt-1.5 text-[9px]">
          <span className="text-amber-400">Each Item</span>
          <span className="text-emerald-400">Done</span>
        </div>
        {d.maxIterations < 100 && (
          <div className="text-[9px] text-muted-foreground mt-1">max {d.maxIterations}</div>
        )}
      </div>
    </NodeExecutionOverlay>
  );
});
