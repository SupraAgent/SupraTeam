"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface CrmActionNodeData {
  label: string;
  crmAction:
    | "send_telegram"
    | "send_email"
    | "send_slack"
    | "send_broadcast"
    | "update_deal"
    | "update_contact"
    | "assign_deal"
    | "create_deal"
    | "create_task"
    | "add_tag"
    | "remove_tag"
    | "tg_manage_access"
    | "ai_summarize"
    | "ai_classify"
    | "add_to_sequence"
    | "remove_from_sequence"
    | "http_request";
  config?: Record<string, string>;
}

const ACTION_META: Record<string, { icon: string; border: string; bg: string; label: string }> = {
  send_telegram: { icon: "✈️", border: "border-cyan-500/40", bg: "bg-cyan-500/10", label: "Send Telegram" },
  send_email: { icon: "📧", border: "border-indigo-500/40", bg: "bg-indigo-500/10", label: "Send Email" },
  send_slack: { icon: "💬", border: "border-purple-500/40", bg: "bg-purple-500/10", label: "Send Slack" },
  send_broadcast: { icon: "📢", border: "border-amber-500/40", bg: "bg-amber-500/10", label: "Broadcast" },
  update_deal: { icon: "📝", border: "border-blue-500/40", bg: "bg-blue-500/10", label: "Update Deal" },
  update_contact: { icon: "👤", border: "border-teal-500/40", bg: "bg-teal-500/10", label: "Update Contact" },
  assign_deal: { icon: "🔄", border: "border-violet-500/40", bg: "bg-violet-500/10", label: "Assign Deal" },
  create_deal: { icon: "✨", border: "border-emerald-500/40", bg: "bg-emerald-500/10", label: "Create Deal" },
  create_task: { icon: "✅", border: "border-green-500/40", bg: "bg-green-500/10", label: "Create Task" },
  add_tag: { icon: "🏷️", border: "border-orange-500/40", bg: "bg-orange-500/10", label: "Add Tag" },
  remove_tag: { icon: "🗑️", border: "border-red-500/40", bg: "bg-red-500/10", label: "Remove Tag" },
  tg_manage_access: { icon: "🔐", border: "border-rose-500/40", bg: "bg-rose-500/10", label: "TG Access" },
  ai_summarize: { icon: "🧠", border: "border-pink-500/40", bg: "bg-pink-500/10", label: "AI Summarize" },
  ai_classify: { icon: "🎯", border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/10", label: "AI Classify" },
  add_to_sequence: { icon: "📋", border: "border-sky-500/40", bg: "bg-sky-500/10", label: "Add to Sequence" },
  remove_from_sequence: { icon: "📋", border: "border-slate-500/40", bg: "bg-slate-500/10", label: "Remove from Sequence" },
  http_request: { icon: "🌐", border: "border-gray-500/40", bg: "bg-gray-500/10", label: "HTTP Request" },
};

export const CrmActionNode = React.memo(function CrmActionNode({ data }: NodeProps) {
  const d = data as unknown as CrmActionNodeData;
  const meta = ACTION_META[d.crmAction] ?? ACTION_META.update_deal;

  return (
    <div className={`rounded-xl border-2 ${meta.border} ${meta.bg} px-4 py-3 min-w-[180px] max-w-[240px]`}>
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{meta.icon}</span>
        <span className="font-semibold text-sm text-foreground truncate">{d.label || meta.label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        CRM Action
      </div>
      {d.config && Object.keys(d.config).length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {Object.entries(d.config).slice(0, 3).map(([k, v]) => (
            <div key={k} className="text-[10px] text-muted-foreground">
              <span className="text-foreground/60">{k}:</span> {String(v).slice(0, 40)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
