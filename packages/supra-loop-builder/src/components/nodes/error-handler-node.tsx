"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const ERROR_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  catch: { icon: "🛡", border: "border-pink-500/40", bg: "bg-pink-500/10" },
  retry: { icon: "🔁", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  fallback: { icon: "🔄", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  log: { icon: "📋", border: "border-gray-500/40", bg: "bg-gray-500/10" },
  ignore: { icon: "🚫", border: "border-slate-500/40", bg: "bg-slate-500/10" },
};

export function ErrorHandlerNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const errorAction = (d.errorAction as string) ?? "catch";
  const label = (d.label as string) ?? "Error Handler";
  const maxRetries = d.maxRetries as number | undefined;
  const style = ERROR_STYLES[errorAction] ?? ERROR_STYLES.catch;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle
        type="source"
        id="success"
        position={Position.Right}
        style={{ top: "33%" }}
        className="!bg-green-400 !w-2.5 !h-2.5"
      />
      <Handle
        type="source"
        id="error"
        position={Position.Right}
        style={{ top: "67%" }}
        className="!bg-red-400 !w-2.5 !h-2.5"
      />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {errorAction} handler
      </div>
      {maxRetries != null && (
        <span className="mt-1 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
          {maxRetries} retries
        </span>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>&#10003;</span>
        <span>&#10007;</span>
      </div>
    </div>
  );
}
