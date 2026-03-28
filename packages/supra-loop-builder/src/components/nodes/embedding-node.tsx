"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const EMBEDDING_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  embed: { icon: "🧬", border: "border-purple-500/40", bg: "bg-purple-500/10" },
  similarity: { icon: "🔗", border: "border-indigo-500/40", bg: "bg-indigo-500/10" },
  cluster: { icon: "🫧", border: "border-blue-500/40", bg: "bg-blue-500/10" },
  nearest: { icon: "📍", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  store: { icon: "💾", border: "border-amber-500/40", bg: "bg-amber-500/10" },
};

export function EmbeddingNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const embeddingAction = (d.embeddingAction as string) ?? "embed";
  const style = EMBEDDING_STYLES[embeddingAction] ?? EMBEDDING_STYLES.embed;
  const provider = d.provider as string | undefined;
  const model = d.model as string | undefined;
  const dimensions = d.dimensions as number | undefined;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{d.label as string}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {embeddingAction} embedding
      </div>
      {(provider || model) && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
          {[provider, model].filter(Boolean).join(" / ")}
        </p>
      )}
      {dimensions != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {dimensions}d vectors
        </p>
      )}
    </div>
  );
}
