"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const LOOP_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  forEach: { icon: "🔄", border: "border-rose-500/40", bg: "bg-rose-500/10" },
  times: { icon: "🔢", border: "border-pink-500/40", bg: "bg-pink-500/10" },
  while: { icon: "⏳", border: "border-red-500/40", bg: "bg-red-500/10" },
  map: { icon: "🗺", border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/10" },
};

export function LoopNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const loopType = (d.loopType as string) ?? "forEach";
  const label = (d.label as string) ?? "Loop";
  const maxIterations = d.maxIterations as number | undefined;
  const style = LOOP_STYLES[loopType] ?? LOOP_STYLES.forEach;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle
        type="source"
        id="item"
        position={Position.Right}
        style={{ top: "33%" }}
        className="!bg-rose-400 !w-2.5 !h-2.5"
      />
      <Handle
        type="source"
        id="done"
        position={Position.Right}
        style={{ top: "67%" }}
        className="!bg-rose-400 !w-2.5 !h-2.5"
      />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {loopType} loop
      </div>
      {maxIterations != null && (
        <span className="mt-1 inline-block rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300">
          max {maxIterations}
        </span>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>item &rarr;</span>
        <span>done &rarr;</span>
      </div>
    </div>
  );
}
