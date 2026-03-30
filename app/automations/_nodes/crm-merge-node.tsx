"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeExecutionOverlay } from "../_lib/execution-overlay";

export interface CrmMergeNodeData {
  label: string;
  mode: "all" | "any";
  inputCount: number;
}

function getCrmMergeData(data: Record<string, unknown>): CrmMergeNodeData {
  const raw = typeof data.inputCount === "number" ? data.inputCount : 2;
  return {
    label: (data.label as string) || "Merge",
    mode: (data.mode as "all" | "any") || "all",
    inputCount: Math.max(2, Math.min(raw, 8)),
  };
}

export const CrmMergeNode = React.memo(function CrmMergeNode({ id, data }: NodeProps) {
  const d = getCrmMergeData(data as Record<string, unknown>);
  const modeLabel = d.mode === "all" ? "Wait All" : "Wait Any";

  return (
    <NodeExecutionOverlay nodeId={id}>
      <div className="rounded-xl border-2 border-indigo-500/40 bg-indigo-500/10 px-4 py-3 min-w-[180px] max-w-[240px]">
        {/* Dynamic target handles on the left */}
        {Array.from({ length: d.inputCount }).map((_, i) => {
          const pct = ((i + 1) / (d.inputCount + 1)) * 100;
          return (
            <Handle
              key={`in-${i}`}
              type="target"
              position={Position.Left}
              id={`in-${i}`}
              className="!bg-indigo-400 !w-2.5 !h-2.5"
              style={{ top: `${pct}%` }}
            />
          );
        })}
        {/* Single source handle on the right */}
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-indigo-400 !w-2.5 !h-2.5"
        />
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">&#x1F500;</span>
          <span className="font-semibold text-sm text-foreground truncate">{d.label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
          Merge / Wait
        </div>
        <div className="inline-block rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
          {modeLabel}
        </div>
      </div>
    </NodeExecutionOverlay>
  );
});
