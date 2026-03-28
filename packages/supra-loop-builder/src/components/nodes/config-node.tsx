"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ConfigNodeData } from "../../lib/flow-templates";

const CONFIG_STYLES: Record<
  string,
  { icon: string; border: string; bg: string; badge: string }
> = {
  root: {
    icon: "📁",
    border: "border-violet-500/40",
    bg: "bg-violet-500/10",
    badge: "bg-violet-500/20 text-violet-300",
  },
  instructions: {
    icon: "📋",
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    badge: "bg-blue-500/20 text-blue-300",
  },
  settings: {
    icon: "⚙️",
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    badge: "bg-amber-500/20 text-amber-300",
  },
  command: {
    icon: "⌨️",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    badge: "bg-emerald-500/20 text-emerald-300",
  },
  rule: {
    icon: "📏",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/10",
    badge: "bg-cyan-500/20 text-cyan-300",
  },
  skill: {
    icon: "🧠",
    border: "border-pink-500/40",
    bg: "bg-pink-500/10",
    badge: "bg-pink-500/20 text-pink-300",
  },
  agent: {
    icon: "🤖",
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
    badge: "bg-orange-500/20 text-orange-300",
  },
};

export const ConfigNode = React.memo(function ConfigNode({ data }: NodeProps) {
  const d = data as ConfigNodeData;
  const style = CONFIG_STYLES[d.configType] ?? CONFIG_STYLES.root;
  const isGitignored = d.gitignored;

  return (
    <div
      className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[200px] max-w-[280px]`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-white/30 !w-2.5 !h-2.5"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-white/30 !w-2.5 !h-2.5"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-white/30 !w-2.5 !h-2.5"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-white/30 !w-2.5 !h-2.5"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground truncate">
          {d.label}
        </span>
        {isGitignored && (
          <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">
            .gitignore
          </span>
        )}
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.badge}`}
        >
          {d.configType}
        </span>
        {!!d.filePath && (
          <span className="text-[10px] font-mono text-muted-foreground truncate">
            {d.filePath}
          </span>
        )}
      </div>

      {/* Description */}
      {!!d.description && (
        <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">
          {d.description}
        </p>
      )}

      {/* Sections */}
      {d.sections && d.sections.length > 0 && (
        <div className="space-y-1 border-t border-white/10 pt-2 mt-1">
          {d.sections.map((section, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[10px] mt-0.5 text-muted-foreground/60">
                {section.icon || "•"}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-medium text-foreground">
                  {section.title}
                </span>
                {section.value && (
                  <span className="text-[10px] text-muted-foreground ml-1 truncate block">
                    {section.value}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
