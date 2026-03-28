"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const JSON_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  parse: { icon: "📥", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  stringify: { icon: "📤", border: "border-yellow-500/40", bg: "bg-yellow-500/10" },
  extract: { icon: "🔍", border: "border-orange-500/40", bg: "bg-orange-500/10" },
  build: { icon: "🏗", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  validate: { icon: "✅", border: "border-blue-500/40", bg: "bg-blue-500/10" },
};

export function JsonNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const jsonAction = (d.jsonAction as string) ?? "parse";
  const style = JSON_STYLES[jsonAction] ?? JSON_STYLES.parse;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {jsonAction} json
      </div>
      {!!d.expression && (
        <p className="mt-1 text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
          {d.expression as string}
        </p>
      )}
    </div>
  );
}
