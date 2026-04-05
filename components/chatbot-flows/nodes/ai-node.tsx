"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AINodeData } from "../types";
import { cn } from "@/lib/utils";

export function ChatbotAINode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AINodeData;
  const preview = nodeData.config.promptTemplate
    ? nodeData.config.promptTemplate.length > 50
      ? nodeData.config.promptTemplate.slice(0, 50) + "..."
      : nodeData.config.promptTemplate
    : "Configure AI prompt...";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-violet-400/60 shadow-lg shadow-violet-500/10" : "border-violet-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-violet-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
            <path d="M8.24 9.93A4 4 0 0 1 12 2" />
            <path d="M12 18v4" />
            <path d="M8 22h8" />
            <circle cx="12" cy="14" r="4" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "AI Response"}
          </p>
          <p className="text-[10px] text-violet-400/70">
            Claude {nodeData.config.model || "sonnet"}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground truncate">{preview}</p>

      {nodeData.config.variableName && (
        <div className="mt-1 inline-flex items-center rounded bg-violet-500/10 px-1.5 py-0.5">
          <p className="text-[9px] text-violet-400/80 font-mono">
            {"{"}collected.{nodeData.config.variableName}{"}"}
          </p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-violet-900"
      />
    </div>
  );
}
