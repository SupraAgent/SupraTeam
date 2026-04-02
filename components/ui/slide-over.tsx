"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
};

export function SlideOver({ open, onClose, title, children, className, wide }: SlideOverProps) {
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 w-full border-l border-white/10 bg-[hsl(225,35%,5%)] shadow-2xl overflow-y-auto transition-[max-width] duration-200",
          wide ? "max-w-md lg:max-w-2xl" : "max-w-md",
          "animate-slide-in",
          className
        )}
        style={{ animation: "slideIn 200ms ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[hsl(225,35%,5%)] px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
