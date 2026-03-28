"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const AGGREGATOR_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  concat: { icon: "🔗", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  sum: { icon: "➕", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  average: { icon: "📊", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  min: { icon: "⬇️", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  max: { icon: "⬆️", border: "border-red-500/40", bg: "bg-red-500/10" },
  count: { icon: "#️⃣", border: "border-purple-500/40", bg: "bg-purple-500/10" },
};

export function AggregatorNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const aggregateType = (d.aggregateType as string) ?? "concat";
  const style = AGGREGATOR_STYLES[aggregateType] ?? AGGREGATOR_STYLES.concat;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[160px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {aggregateType} aggregate
      </div>
    </div>
  );
}
