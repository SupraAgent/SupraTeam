"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type EmptyStateVariant = "setup" | "empty" | "filtered";

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "empty",
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  variant?: EmptyStateVariant;
  className?: string;
}) {
  const borderClass =
    variant === "setup"
      ? "border-amber-500/20 bg-amber-500/[0.03]"
      : variant === "filtered"
        ? "border-white/10 bg-white/[0.02]"
        : "border-dashed border-white/20 bg-white/[0.02]";

  return (
    <div className={cn("rounded-2xl border p-8 text-center", borderClass, className)}>
      {icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
        >
          {action.label}
          <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 4l4 4-4 4" />
          </svg>
        </Link>
      )}
    </div>
  );
}
