"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-4", className)}>
      {/* Desktop: full trail */}
      <ol className="hidden items-center gap-1.5 text-sm sm:flex">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <span className="text-muted-foreground/40" aria-hidden="true">/</span>
              )}
              {isLast || !item.href ? (
                <span className="max-w-[200px] truncate font-medium text-foreground" aria-current="page">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="truncate text-muted-foreground transition hover:text-foreground"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {/* Mobile: back link to parent */}
      {items.length >= 2 && (
        <div className="sm:hidden">
          <Link
            href={items[items.length - 2].href ?? "/"}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {items[items.length - 2].label}
          </Link>
        </div>
      )}
    </nav>
  );
}
