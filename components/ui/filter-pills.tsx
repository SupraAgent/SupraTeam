"use client";

import { cn } from "@/lib/utils";

export type FilterDef = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

export function FilterPills({
  filters,
  className,
}: {
  filters: FilterDef[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((f) => {
        const isDefault = f.value === f.options[0]?.value;
        return (
          <div key={f.key} className="relative">
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className={cn(
                "appearance-none rounded-full border px-3 py-1 pr-7 text-xs font-medium transition cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                isDefault
                  ? "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-foreground"
                  : "border-primary/30 bg-primary/10 text-primary"
              )}
            >
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {f.label}: {opt.label}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 12 12"
              width={10}
              height={10}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <path d="M3 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!isDefault && (
              <button
                type="button"
                onClick={() => f.onChange(f.options[0]?.value ?? "")}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary hover:bg-primary/30"
                aria-label={`Clear ${f.label} filter`}
              >
                <svg viewBox="0 0 8 8" width={6} height={6} fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M1 1l6 6M7 1l-6 6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
