"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TriggerNodeData } from "@/lib/workflow-types";
import {
  ArrowRightLeft,
  PlusCircle,
  Mail,
  MessageCircle,
  Calendar,
  Webhook,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  deal_stage_change: ArrowRightLeft,
  deal_created: PlusCircle,
  email_received: Mail,
  tg_message: MessageCircle,
  calendar_event: Calendar,
  webhook: Webhook,
  manual: Play,
};

const TRIGGER_LABELS: Record<string, string> = {
  deal_stage_change: "Deal Stage Change",
  deal_created: "Deal Created",
  email_received: "Email Received",
  tg_message: "Telegram Message",
  calendar_event: "Calendar Event",
  webhook: "Webhook",
  manual: "Manual Trigger",
};

export function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const Icon = TRIGGER_ICONS[nodeData.triggerType] ?? Play;
  const sublabel = TRIGGER_LABELS[nodeData.triggerType] ?? nodeData.triggerType;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[180px] max-w-[240px] transition-all",
        selected ? "border-purple-400/60 shadow-lg shadow-purple-500/10" : "border-purple-500/20"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-purple-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Trigger"}
          </p>
          <p className="text-[10px] text-purple-400/70 truncate">{sublabel}</p>
        </div>
      </div>

      {/* Config summary */}
      {nodeData.triggerType === "deal_stage_change" && (nodeData.config as { to_stage?: string }).to_stage && (
        <p className="mt-2 text-[10px] text-muted-foreground truncate">
          → {(nodeData.config as { to_stage: string }).to_stage}
        </p>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-purple-900"
      />
    </div>
  );
}
