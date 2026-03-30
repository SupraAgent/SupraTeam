"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeExecutionOverlay } from "../_lib/execution-overlay";

export interface CrmTriggerNodeData {
  label: string;
  crmTrigger:
    | "deal_stage_change"
    | "deal_created"
    | "deal_won"
    | "deal_lost"
    | "deal_stale"
    | "deal_value_change"
    | "contact_created"
    | "tg_message"
    | "tg_member_joined"
    | "tg_member_left"
    | "email_received"
    | "lead_qualified"
    | "scheduled"
    | "task_overdue"
    | "calendar_event"
    | "webhook"
    | "manual"
    | "bot_dm_received";
  config?: Record<string, string>;
}

const TRIGGER_META: Record<string, { icon: string; border: string; bg: string; label: string }> = {
  deal_stage_change: { icon: "📊", border: "border-violet-500/40", bg: "bg-violet-500/10", label: "Stage Change" },
  deal_created: { icon: "✨", border: "border-emerald-500/40", bg: "bg-emerald-500/10", label: "Deal Created" },
  deal_won: { icon: "🏆", border: "border-amber-500/40", bg: "bg-amber-500/10", label: "Deal Won" },
  deal_lost: { icon: "❌", border: "border-red-500/40", bg: "bg-red-500/10", label: "Deal Lost" },
  deal_stale: { icon: "⏳", border: "border-orange-500/40", bg: "bg-orange-500/10", label: "Deal Stale" },
  deal_value_change: { icon: "💰", border: "border-green-500/40", bg: "bg-green-500/10", label: "Value Change" },
  contact_created: { icon: "👤", border: "border-blue-500/40", bg: "bg-blue-500/10", label: "Contact Created" },
  task_overdue: { icon: "⚠️", border: "border-amber-500/40", bg: "bg-amber-500/10", label: "Task Overdue" },
  tg_message: { icon: "💬", border: "border-cyan-500/40", bg: "bg-cyan-500/10", label: "TG Message" },
  tg_member_joined: { icon: "📥", border: "border-teal-500/40", bg: "bg-teal-500/10", label: "TG Member Joined" },
  tg_member_left: { icon: "📤", border: "border-rose-500/40", bg: "bg-rose-500/10", label: "TG Member Left" },
  email_received: { icon: "📧", border: "border-indigo-500/40", bg: "bg-indigo-500/10", label: "Email Received" },
  calendar_event: { icon: "📅", border: "border-blue-500/40", bg: "bg-blue-500/10", label: "Calendar Event" },
  webhook: { icon: "🔗", border: "border-gray-500/40", bg: "bg-gray-500/10", label: "Webhook" },
  manual: { icon: "👆", border: "border-slate-500/40", bg: "bg-slate-500/10", label: "Manual" },
  lead_qualified: { icon: "🎯", border: "border-pink-500/40", bg: "bg-pink-500/10", label: "Lead Qualified" },
  scheduled: { icon: "🕐", border: "border-slate-500/40", bg: "bg-slate-500/10", label: "Scheduled" },
  bot_dm_received: { icon: "🤖", border: "border-purple-500/40", bg: "bg-purple-500/10", label: "Bot DM Received" },
};

function getCrmTriggerData(data: Record<string, unknown>): CrmTriggerNodeData {
  return {
    label: (data.label as string) || "",
    crmTrigger: (data.crmTrigger as CrmTriggerNodeData["crmTrigger"]) || "deal_stage_change",
    config: data.config as Record<string, string> | undefined,
  };
}

export const CrmTriggerNode = React.memo(function CrmTriggerNode({ id, data }: NodeProps) {
  const d = getCrmTriggerData(data as Record<string, unknown>);
  const meta = TRIGGER_META[d.crmTrigger] ?? TRIGGER_META.deal_stage_change;

  return (
    <NodeExecutionOverlay nodeId={id}>
    <div className={`rounded-xl border-2 ${meta.border} ${meta.bg} px-4 py-3 min-w-[180px] max-w-[240px]`}>
      <Handle type="source" position={Position.Right} className="!bg-violet-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{meta.icon}</span>
        <span className="font-semibold text-sm text-foreground truncate">{d.label || meta.label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        CRM Trigger
      </div>
      {d.config && Object.keys(d.config).length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {Object.entries(d.config).slice(0, 3).map(([k, v]) => (
            <div key={k} className="text-[10px] text-muted-foreground">
              <span className="text-foreground/60">{k}:</span> {v}
            </div>
          ))}
        </div>
      )}
    </div>
    </NodeExecutionOverlay>
  );
});
