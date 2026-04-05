"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play, Users, MessageSquare, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TGTriggerNodeData, TriggerType } from "../types";

const TRIGGER_ICONS: Record<TriggerType, React.ElementType> = {
  manual: Play,
  group_join: Users,
  first_message: MessageSquare,
  keyword_match: Search,
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  manual: "Manual Trigger",
  group_join: "Group Join",
  first_message: "First Message",
  keyword_match: "Keyword Match",
};

export function TGTriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TGTriggerNodeData;
  const Icon = TRIGGER_ICONS[nodeData.trigger_type] ?? Play;
  const label = nodeData.label || TRIGGER_LABELS[nodeData.trigger_type] || "Trigger";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-emerald-400/60 shadow-lg shadow-emerald-500/10" : "border-emerald-500/20"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{label}</p>
          <p className="text-[10px] text-emerald-400/70 truncate">
            {nodeData.trigger_type.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-900"
      />
    </div>
  );
}
