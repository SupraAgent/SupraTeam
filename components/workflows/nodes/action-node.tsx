"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ActionNodeData } from "@/lib/workflow-types";
import { Send, Mail, Pencil, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_ICONS: Record<string, React.ElementType> = {
  send_telegram: Send,
  send_email: Mail,
  update_deal: Pencil,
  create_task: CheckSquare,
};

const ACTION_LABELS: Record<string, string> = {
  send_telegram: "Send Telegram",
  send_email: "Send Email",
  update_deal: "Update Deal",
  create_task: "Create Task",
};

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;
  const Icon = ACTION_ICONS[nodeData.actionType] ?? Send;
  const sublabel = ACTION_LABELS[nodeData.actionType] ?? nodeData.actionType;

  // Build a short config summary
  let summary = "";
  if (nodeData.actionType === "send_telegram") {
    const msg = (nodeData.config as { message?: string }).message;
    if (msg) summary = msg.slice(0, 40) + (msg.length > 40 ? "…" : "");
  } else if (nodeData.actionType === "send_email") {
    const subj = (nodeData.config as { subject?: string }).subject;
    if (subj) summary = subj;
  } else if (nodeData.actionType === "update_deal") {
    const cfg = nodeData.config as { field?: string; value?: string };
    if (cfg.field) summary = `${cfg.field} → ${cfg.value || "?"}`;
  } else if (nodeData.actionType === "create_task") {
    const title = (nodeData.config as { title?: string }).title;
    if (title) summary = title;
  }

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
          <Icon className="h-4 w-4 text-blue-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {nodeData.label || "Action"}
          </p>
          <p className="text-[10px] text-blue-400/70 truncate">{sublabel}</p>
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
