"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const SUMMARIZER_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  bullets: { icon: "📌", border: "border-violet-500/40", bg: "bg-violet-500/10" },
  abstract: { icon: "📝", border: "border-indigo-500/40", bg: "bg-indigo-500/10" },
  tldr: { icon: "⚡", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  takeaways: { icon: "💡", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  headline: { icon: "📰", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  custom: { icon: "✏️", border: "border-purple-500/40", bg: "bg-purple-500/10" },
};

export function SummarizerNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const summaryStyle = (d.summaryStyle as string) ?? "bullets";
  const style = SUMMARIZER_STYLES[summaryStyle] ?? SUMMARIZER_STYLES.bullets;
  const maxLength = d.maxLength as number | undefined;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {summaryStyle} summary
      </div>
      {maxLength != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          max {maxLength} words
        </p>
      )}
    </div>
  );
}
