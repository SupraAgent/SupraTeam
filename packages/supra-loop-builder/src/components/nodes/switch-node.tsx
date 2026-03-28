"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

export function SwitchNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const label = (d.label as string) ?? "Switch";
  const matchType = (d.matchType as string) ?? "exact";
  const field = (d.field as string) ?? "";
  const casesRaw = (d.cases as string) ?? "[]";

  let cases: string[];
  try {
    const parsed = JSON.parse(casesRaw);
    cases = Array.isArray(parsed) ? parsed.map(String) : ["case1", "case2", "default"];
  } catch {
    cases = ["case1", "case2", "default"];
  }

  return (
    <div className="rounded-xl border-2 border-pink-500/40 bg-pink-500/10 px-4 py-3 min-w-[180px]">
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      {cases.map((c, i) => (
        <Handle
          key={c}
          type="source"
          id={c}
          position={Position.Right}
          style={{ top: `${((i + 1) / (cases.length + 1)) * 100}%` }}
          className="!bg-pink-400 !w-2.5 !h-2.5"
        />
      ))}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🔀</span>
        <span className="font-semibold text-sm text-foreground">{label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {matchType} match
      </div>
      {field && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          field: {field}
        </p>
      )}
      <div className="mt-1 flex flex-col gap-0.5">
        {cases.map((c) => (
          <span key={c} className="text-[10px] text-pink-300 truncate">
            {c} &rarr;
          </span>
        ))}
      </div>
      <span className="mt-1 inline-block rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] text-pink-300">
        {cases.length} cases
      </span>
    </div>
  );
}
