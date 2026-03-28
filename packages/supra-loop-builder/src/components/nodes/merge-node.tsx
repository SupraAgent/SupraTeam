"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const MERGE_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  waitAll: { icon: "⏳", border: "border-rose-500/40", bg: "bg-rose-500/10" },
  firstComplete: { icon: "🏁", border: "border-pink-500/40", bg: "bg-pink-500/10" },
  combine: { icon: "🔗", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  zip: { icon: "🤐", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  append: { icon: "➕", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
};

export function MergeNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const mergeStrategy = (d.mergeStrategy as string) ?? "waitAll";
  const label = (d.label as string) ?? "Merge";
  const outputFormat = d.outputFormat as string | undefined;
  const style = MERGE_STYLES[mergeStrategy] ?? MERGE_STYLES.waitAll;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[160px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {mergeStrategy} merge
      </div>
      {outputFormat && (
        <span className="mt-1 inline-block rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300">
          {outputFormat}
        </span>
      )}
    </div>
  );
}
