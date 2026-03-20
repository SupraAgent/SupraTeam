"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type StatusIndicator = "success" | "error" | "warning" | "running" | "neutral";

const STATUS_STYLES: Record<StatusIndicator, string> = {
  success: "bg-emerald-400",
  error: "bg-red-400",
  warning: "bg-amber-400",
  running: "bg-amber-400 animate-pulse",
  neutral: "bg-white/20",
};

export function Collapsible({
  title,
  status,
  count,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  status?: StatusIndicator;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 12 12"
          width={12}
          height={12}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={cn("shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-90")}
        >
          <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {status && (
          <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_STYLES[status])}>
            <span className="sr-only">{status}</span>
          </span>
        )}
        <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
        {count != null && (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {count}
          </span>
        )}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/10 px-4 py-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
