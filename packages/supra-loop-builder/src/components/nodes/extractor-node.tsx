"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const EXTRACTOR_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  entities: { icon: "🏷️", border: "border-purple-500/40", bg: "bg-purple-500/10" },
  dates: { icon: "📅", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  amounts: { icon: "💰", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  contacts: { icon: "👤", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  table: { icon: "📊", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  custom: { icon: "🔧", border: "border-indigo-500/40", bg: "bg-indigo-500/10" },
};

export function ExtractorNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const extractType = (d.extractType as string) ?? "entities";
  const style = EXTRACTOR_STYLES[extractType] ?? EXTRACTOR_STYLES.entities;
  const fields = d.fields as string[] | undefined;
  const outputFormat = d.outputFormat as string | undefined;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {extractType} extractor
      </div>
      {fields && fields.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {fields.join(", ")}
        </p>
      )}
      {outputFormat && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {outputFormat} format
        </p>
      )}
    </div>
  );
}
