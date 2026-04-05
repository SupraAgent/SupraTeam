"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TGConditionNodeData } from "../types";
import { CONDITION_TYPE_LABELS } from "../types";

function getConditionSummary(data: TGConditionNodeData): string {
  switch (data.condition_type) {
    case "reply_received":
      return "Reply received?";
    case "no_reply_timeout":
      return `No reply in ${data.timeout_hours ?? 24}h`;
    case "engagement_score":
      return `Score >= ${data.threshold ?? 50}`;
    case "deal_stage":
      return data.stage_id ? "In target stage?" : "Select stage...";
    case "message_keyword":
      return data.keyword ? `Contains "${data.keyword}"` : "Set keyword...";
    case "days_since_enroll":
      return `>= ${data.days ?? 7} days`;
    case "ab_split":
      return `${data.split_percentage ?? 50}% / ${100 - (data.split_percentage ?? 50)}%`;
    default:
      return "Configure...";
  }
}

export function TGConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TGConditionNodeData;
  const summary = getConditionSummary(nodeData);
  const typeLabel = CONDITION_TYPE_LABELS[nodeData.condition_type] ?? nodeData.condition_type;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[200px] max-w-[260px] transition-all",
        selected ? "border-yellow-400/60 shadow-lg shadow-yellow-500/10" : "border-yellow-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-yellow-400 !border-2 !border-yellow-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
          <GitBranch className="h-4 w-4 text-yellow-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Condition"}
          </p>
          <p className="text-[10px] text-yellow-400/70 truncate">{typeLabel}</p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground truncate">{summary}</p>

      <div className="flex justify-between mt-2 text-[9px] text-muted-foreground px-1">
        <span className="text-emerald-400">True</span>
        <span className="text-red-400">False</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-900"
        style={{ left: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!w-3 !h-3 !bg-red-400 !border-2 !border-red-900"
        style={{ left: "70%" }}
      />
    </div>
  );
}
