"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TGMessageNodeData } from "../types";

export function TGMessageNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TGMessageNodeData;
  const hasVariants = !!(nodeData.variant_b_template || nodeData.variant_c_template);
  const preview = nodeData.template
    ? nodeData.template.length > 60
      ? nodeData.template.slice(0, 60) + "..."
      : nodeData.template
    : "Click to edit message...";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 min-w-[200px] max-w-[260px] transition-all",
        selected ? "border-blue-400/60 shadow-lg shadow-blue-500/10" : "border-blue-500/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
      />

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
          <MessageSquare className="h-4 w-4 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-foreground truncate">
              {nodeData.label || "Message"}
            </p>
            {hasVariants && (
              <span className="flex items-center gap-0.5 rounded bg-purple-500/20 px-1 py-0.5 text-[9px] text-purple-400 shrink-0">
                <FlaskConical className="h-2.5 w-2.5" />
                A/B
              </span>
            )}
          </div>
          <p className="text-[10px] text-blue-400/70">
            {nodeData.delay_hours > 0 ? `Delay: ${nodeData.delay_hours}h` : "No delay"}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground font-mono truncate">{preview}</p>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-900"
      />
    </div>
  );
}
