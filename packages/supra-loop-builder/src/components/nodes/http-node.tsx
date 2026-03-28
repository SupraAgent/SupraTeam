"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const METHOD_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  GET: { icon: "📥", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  POST: { icon: "📤", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  PUT: { icon: "📝", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  PATCH: { icon: "🩹", border: "border-orange-500/40", bg: "bg-orange-500/10" },
  DELETE: { icon: "🗑", border: "border-red-500/40", bg: "bg-red-500/10" },
};

export function HttpNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const method = (d.method as string) ?? "GET";
  const style = METHOD_STYLES[method] ?? METHOD_STYLES.GET;
  const authType = d.authType as string | undefined;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10">
          {method}
        </span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      {!!d.url && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {d.url as string}
        </p>
      )}
      {authType && authType !== "none" && (
        <p className="mt-1 text-[10px] text-muted-foreground uppercase tracking-wide">
          auth: {authType}
        </p>
      )}
    </div>
  );
}
