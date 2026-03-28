"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const TEXT_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  split: { icon: "✂️", border: "border-yellow-500/40", bg: "bg-yellow-500/10" },
  join: { icon: "🔗", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  replace: { icon: "🔄", border: "border-orange-500/40", bg: "bg-orange-500/10" },
  truncate: { icon: "📏", border: "border-red-500/40", bg: "bg-red-500/10" },
  template: { icon: "📝", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  regex: { icon: "🔣", border: "border-purple-500/40", bg: "bg-purple-500/10" },
};

export function TextNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const textAction = (d.textAction as string) ?? "split";
  const style = TEXT_STYLES[textAction] ?? TEXT_STYLES.split;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-yellow-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {textAction} text
      </div>
      {!!d.template && (
        <p className="mt-1 text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
          {d.template as string}
        </p>
      )}
      {!!d.delimiter && (
        <p className="mt-1 text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
          delim: {d.delimiter as string}
        </p>
      )}
    </div>
  );
}
