"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { QuestionNodeData } from "../types";
import { cn } from "@/lib/utils";

export function ChatbotQuestionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as QuestionNodeData;
  const preview = nodeData.config.questionText
    ? nodeData.config.questionText.length > 50
      ? nodeData.config.questionText.slice(0, 50) + "..."
      : nodeData.config.questionText
    : "Configure question...";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-green-400/60 shadow-lg shadow-green-500/10" : "border-green-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Question"}
          </p>
          <p className="text-[10px] text-green-400/70">
            {nodeData.config.responseType || "text"} response
          </p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground truncate">{preview}</p>

      {nodeData.config.variableName && (
        <div className="mt-1 inline-flex items-center rounded bg-green-500/10 px-1.5 py-0.5">
          <p className="text-[9px] text-green-400/80 font-mono">
            {"{"}collected.{nodeData.config.variableName}{"}"}
          </p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-900"
      />
    </div>
  );
}
