"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const DELAY_STYLES: Record<string, { icon: string; border: string; bg: string }> = {
  fixed: { icon: "⏱", border: "border-rose-500/40", bg: "bg-rose-500/10" },
  random: { icon: "🎲", border: "border-pink-500/40", bg: "bg-pink-500/10" },
  throttle: { icon: "🚦", border: "border-orange-500/40", bg: "bg-orange-500/10" },
  debounce: { icon: "⏸", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  cron: { icon: "📅", border: "border-purple-500/40", bg: "bg-purple-500/10" },
};

export function DelayNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>;
  const delayType = (d.delayType as string) ?? "fixed";
  const label = (d.label as string) ?? "Delay";
  const duration = (d.duration as number | string) ?? 1;
  const schedule = d.schedule as string | undefined;
  const style = DELAY_STYLES[delayType] ?? DELAY_STYLES.fixed;

  const durationDisplay =
    delayType === "random"
      ? `${duration}s`
      : delayType === "cron" && schedule
        ? schedule
        : `${Number(duration).toFixed(1)}s`;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} px-4 py-3 min-w-[160px]`}>
      <Handle type="target" position={Position.Left} className="!bg-white/40 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-rose-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{style.icon}</span>
        <span className="font-semibold text-sm text-foreground">{label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {delayType} delay
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{durationDisplay}</p>
    </div>
  );
}
