"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MessageNodeData } from "../types";
import { cn } from "@/lib/utils";

export function ChatbotMessageNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MessageNodeData;
  const preview = nodeData.config.messageText
    ? nodeData.config.messageText.length > 60
      ? nodeData.config.messageText.slice(0, 60) + "..."
      : nodeData.config.messageText
    : "Configure message...";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-cyan-400/60 shadow-lg shadow-cyan-500/10" : "border-cyan-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-cyan-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Message"}
          </p>
          <p className="text-[10px] text-cyan-400/70">Send message</p>
        </div>
      </div>

      <div className="mt-2 rounded-lg bg-cyan-500/5 border border-cyan-500/10 px-2.5 py-1.5">
        <p className="text-[10px] text-muted-foreground truncate">{preview}</p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-cyan-900"
      />
    </div>
  );
}
