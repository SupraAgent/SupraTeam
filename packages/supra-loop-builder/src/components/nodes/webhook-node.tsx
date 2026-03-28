"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const WEBHOOK_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  POST: { icon: "🔗", border: "border-teal-500/40", bg: "bg-teal-500/10" },
  GET: { icon: "🔗", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  PUT: { icon: "🔗", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  ANY: { icon: "🔗", border: "border-gray-500/40", bg: "bg-gray-500/10" },
};

export function WebhookNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const webhookMethod = (d.webhookMethod as string) ?? "POST";
  const style = WEBHOOK_STYLES[webhookMethod] ?? WEBHOOK_STYLES.POST;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10">
          {webhookMethod}
        </span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        webhook
      </div>
      {!!d.path && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {d.path as string}
        </p>
      )}
    </div>
  );
}
