"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const EMAIL_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  send: { icon: "📧", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  read: { icon: "📬", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  reply: { icon: "↩️", border: "border-teal-500/40", bg: "bg-teal-500/10" },
  forward: { icon: "↗️", border: "border-indigo-500/40", bg: "bg-indigo-500/10" },
};

export function EmailNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const emailAction = (d.emailAction as string) ?? "send";
  const style = EMAIL_STYLES[emailAction] ?? EMAIL_STYLES.send;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {emailAction} email
      </div>
      {!!d.to && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {d.to as string}
        </p>
      )}
      {!!d.provider && (
        <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">
          {d.provider as string}
        </span>
      )}
    </div>
  );
}
