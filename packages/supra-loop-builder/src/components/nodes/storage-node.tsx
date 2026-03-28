"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const STORAGE_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  read: { icon: "📂", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  write: { icon: "💾", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  list: { icon: "📋", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  delete: { icon: "🗑", border: "border-red-500/40", bg: "bg-red-500/10" },
  copy: { icon: "📎", border: "border-amber-500/40", bg: "bg-amber-500/10" },
};

export function StorageNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const storageAction = (d.storageAction as string) ?? "read";
  const style = STORAGE_STYLES[storageAction] ?? STORAGE_STYLES.read;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {storageAction}
      </div>
      {!!d.provider && (
        <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">
          {d.provider as string}
        </span>
      )}
      {!!d.path && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {d.path as string}
        </p>
      )}
    </div>
  );
}
