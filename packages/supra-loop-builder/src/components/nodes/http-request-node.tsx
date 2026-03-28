"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { HttpRequestNodeData } from "../../lib/flow-templates";

const METHOD_STYLES: Record<string, { color: string; bg: string }> = {
  GET: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  POST: { color: "text-blue-400", bg: "bg-blue-500/10" },
  PUT: { color: "text-amber-400", bg: "bg-amber-500/10" },
  PATCH: { color: "text-orange-400", bg: "bg-orange-500/10" },
  DELETE: { color: "text-red-400", bg: "bg-red-500/10" },
};

export function HttpRequestNode({ data }: NodeProps) {
  const d = data as HttpRequestNodeData;
  const method = d.method || "GET";
  const style = METHOD_STYLES[method] ?? METHOD_STYLES.GET;

  return (
    <div className="rounded-xl border-2 border-cyan-400/40 bg-cyan-500/5 px-4 py-3 min-w-[200px] shadow-lg shadow-black/10">
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-white/40 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${style.color} ${style.bg}`}>
          {method}
        </span>
        <span className="text-sm font-semibold text-foreground truncate max-w-[160px]">
          {d.label || "HTTP Request"}
        </span>
      </div>
      {!!d.url && (
        <div className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={d.url}>
          {d.url}
        </div>
      )}
      {d.headers && Object.keys(d.headers).length > 0 && (
        <div className="text-[10px] text-muted-foreground/50 mt-0.5">
          {Object.keys(d.headers).length} header{Object.keys(d.headers).length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
