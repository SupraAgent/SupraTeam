"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { RescoreNodeData } from "../../lib/flow-templates";

export const RescoreNode = React.memo(function RescoreNode({
  data,
}: NodeProps) {
  const d = data as RescoreNodeData;

  return (
    <div className="relative rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 px-4 py-3 min-w-[180px] max-w-[260px]">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-white/40 !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-white/40 !w-2 !h-2"
      />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">📊</span>
        <span className="font-semibold text-sm text-foreground truncate">
          {d.label}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground mb-1.5">
        Re-score after improvements and compare before/after
      </p>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5">
          {d.categories?.length ?? 8} categories
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5">
          {d.showDelta ? "Delta" : "Score"}
        </span>
      </div>
    </div>
  );
});
