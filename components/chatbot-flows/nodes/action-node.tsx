"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ActionNodeData } from "../types";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  create_contact: "Create Contact",
  create_deal: "Create Deal",
  assign_to: "Assign Rep",
  add_tag: "Add Tag",
  send_notification: "Send Notification",
  enroll_in_sequence: "Enroll in Sequence",
};

export function ChatbotActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;
  const actionLabel = ACTION_LABELS[nodeData.config.actionType] || nodeData.config.actionType;

  let summary = "";
  if (nodeData.config.dealName) summary = nodeData.config.dealName;
  else if (nodeData.config.tagName) summary = nodeData.config.tagName;
  else if (nodeData.config.notificationMessage) summary = nodeData.config.notificationMessage;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-blue-400/60 shadow-lg shadow-blue-500/10" : "border-blue-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
          <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Action"}
          </p>
          <p className="text-[10px] text-blue-400/70 truncate">{actionLabel}</p>
        </div>
      </div>

      {summary && (
        <p className="mt-2 text-[10px] text-muted-foreground truncate">{summary}</p>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
      />
    </div>
  );
}
