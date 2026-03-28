"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const SEARCH_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  brave: { icon: "🦁", border: "border-indigo-500/40", bg: "bg-indigo-500/10" },
  serper: { icon: "🔎", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  tavily: { icon: "🌐", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  google: { icon: "🔍", border: "border-red-500/40", bg: "bg-red-500/10" },
  bing: { icon: "🅱️", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
};

export function SearchNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const searchProvider = (d.searchProvider as string) ?? "brave";
  const style = SEARCH_STYLES[searchProvider] ?? SEARCH_STYLES.brave;
  const query = d.query as string | undefined;
  const maxResults = d.maxResults as number | undefined;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {searchProvider} search
      </div>
      {query && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {query}
        </p>
      )}
      {maxResults != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          max {maxResults} results
        </p>
      )}
    </div>
  );
}
