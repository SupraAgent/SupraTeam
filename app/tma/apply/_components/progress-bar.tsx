"use client";

type ProgressBarProps = {
  current: number;
  total: number;
};

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = Math.min(((current + 1) / total) * 100, 100);

  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-white/40 tabular-nums whitespace-nowrap">
        {current + 1} / {total}
      </span>
    </div>
  );
}
