"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ResizableDividerProps = {
  /** Which direction to resize: "left" adjusts the element to the left, "right" adjusts right */
  direction?: "left" | "right";
  className?: string;
  onResize?: (delta: number) => void;
};

/**
 * Draggable divider that sits between two panes.
 * Emits pixel deltas via onResize so the parent can update widths.
 */
export function ResizableDivider({
  direction = "left",
  className,
  onResize,
}: ResizableDividerProps) {
  const dragging = React.useRef(false);
  const lastX = React.useRef(0);

  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - lastX.current;
        lastX.current = ev.clientX;
        onResize?.(direction === "left" ? delta : -delta);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, onResize]
  );

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "shrink-0 w-1 cursor-col-resize group relative z-10",
        "hover:bg-primary/30 active:bg-primary/50 transition-colors",
        className
      )}
    >
      {/* Wider invisible hit area */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

/**
 * Hook that manages a persisted pane width with min/max constraints.
 */
export function usePaneWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
): [number, (delta: number) => void, React.Dispatch<React.SetStateAction<number>>] {
  const [width, setWidth] = React.useState(() => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n;
      }
    } catch { /* noop */ }
    return defaultWidth;
  });

  const handleResize = React.useCallback(
    (delta: number) => {
      setWidth((prev) => {
        const next = Math.min(maxWidth, Math.max(minWidth, prev + delta));
        try { localStorage.setItem(storageKey, String(next)); } catch { /* noop */ }
        return next;
      });
    },
    [storageKey, minWidth, maxWidth]
  );

  return [width, handleResize, setWidth];
}
