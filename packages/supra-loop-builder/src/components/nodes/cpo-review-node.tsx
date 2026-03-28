"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CpoReviewNodeData } from "../../lib/flow-templates";

export const CpoReviewNode = React.memo(function CpoReviewNode({
  data,
}: NodeProps) {
  const d = data as CpoReviewNodeData;
  const personaCount = d.personas?.length ?? 0;

  return (
    <div className="relative rounded-xl border-2 border-violet-500/30 bg-violet-500/5 px-4 py-3 min-w-[180px] max-w-[260px]">
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
        <span className="text-base">👔</span>
        <span className="font-semibold text-sm text-foreground truncate">
          {d.label}
        </span>
      </div>

      {d.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1.5">
          {d.description}
        </p>
      )}

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-400/10 px-1.5 py-0.5">
          {personaCount} persona{personaCount !== 1 ? "s" : ""}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-400/10 px-1.5 py-0.5">
          {d.reviewMode === "consensus" ? "Consensus" : "Individual"}
        </span>
      </div>
    </div>
  );
});
