"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const DB_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  query: { icon: "🔍", border: "border-teal-500/40", bg: "bg-teal-500/10" },
  insert: { icon: "➕", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  update: { icon: "✏️", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  delete: { icon: "🗑", border: "border-red-500/40", bg: "bg-red-500/10" },
  upsert: { icon: "🔄", border: "border-blue-500/40", bg: "bg-blue-500/10" },
};

export function DatabaseNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const dbAction = (d.dbAction as string) ?? "query";
  const style = DB_STYLES[dbAction] ?? DB_STYLES.query;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {dbAction}
      </div>
      {!!d.dbType && (
        <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">
          {d.dbType as string}
        </span>
      )}
      {!!d.table && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {d.table as string}
        </p>
      )}
    </div>
  );
}
