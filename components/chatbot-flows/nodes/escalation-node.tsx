"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { EscalationNodeData } from "../types";
import { cn } from "@/lib/utils";

export function ChatbotEscalationNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as EscalationNodeData;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-red-400/60 shadow-lg shadow-red-500/10" : "border-red-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-red-400 !border-2 !border-red-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Escalation"}
          </p>
          <p className="text-[10px] text-red-400/70">Hand off to human</p>
        </div>
      </div>

      {nodeData.config.reason && (
        <p className="mt-2 text-[10px] text-muted-foreground truncate">
          {nodeData.config.reason}
        </p>
      )}

      {nodeData.config.notifyRoles.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {nodeData.config.notifyRoles.map((role) => (
            <span
              key={role}
              className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-400/80"
            >
              {role}
            </span>
          ))}
        </div>
      )}

      {/* Terminal node — no source handle */}
    </div>
  );
}
