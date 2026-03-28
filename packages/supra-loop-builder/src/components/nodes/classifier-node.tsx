"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const CLASSIFIER_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  sentiment: { icon: "😊", border: "border-indigo-500/40", bg: "bg-indigo-500/10" },
  topic: { icon: "📂", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  intent: { icon: "🎯", border: "border-violet-500/40", bg: "bg-violet-500/10" },
  spam: { icon: "🚫", border: "border-red-500/40", bg: "bg-red-500/10" },
  language: { icon: "🌍", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  custom: { icon: "🏷️", border: "border-purple-500/40", bg: "bg-purple-500/10" },
};

export function ClassifierNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const classifyType = (d.classifyType as string) ?? "sentiment";
  const style = CLASSIFIER_STYLES[classifyType] ?? CLASSIFIER_STYLES.sentiment;
  const confidence = d.confidence as number | undefined;
  const categories = d.categories as string[] | undefined;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {classifyType} classifier
      </div>
      {confidence != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          confidence ≥ {confidence}%
        </p>
      )}
      {classifyType === "custom" && categories && categories.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {categories.join(", ")}
        </p>
      )}
    </div>
  );
}
