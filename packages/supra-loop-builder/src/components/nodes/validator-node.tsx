"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const VALIDATOR_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  required: { icon: "❗", border: "border-yellow-500/40", bg: "bg-yellow-500/10" },
  "type-check": { icon: "🏷", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  range: { icon: "↔️", border: "border-orange-500/40", bg: "bg-orange-500/10" },
  regex: { icon: "🔣", border: "border-purple-500/40", bg: "bg-purple-500/10" },
  schema: { icon: "📐", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  custom: { icon: "⚙️", border: "border-gray-500/40", bg: "bg-gray-500/10" },
};

export function ValidatorNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const validationType = (d.validationType as string) ?? "required";
  const style = VALIDATOR_STYLES[validationType] ?? VALIDATOR_STYLES.required;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[170px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle
        type="source"
        position={Position.Right}
        id="pass"
        style={{ top: "33%" }}
        className="!bg-emerald-400 !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="fail"
        style={{ top: "67%" }}
        className="!bg-red-400 !w-2 !h-2"
      />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {validationType} validation
      </div>
      {!!d.field && (
        <p className="mt-1 text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
          {d.field as string}{d.rule ? ` → ${d.rule as string}` : ""}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3 text-[10px]">
        <span className="text-emerald-400">● Pass ✓</span>
        <span className="text-red-400">● Fail ✗</span>
      </div>
    </div>
  );
}
