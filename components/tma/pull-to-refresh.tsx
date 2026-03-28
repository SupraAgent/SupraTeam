"use client";

import * as React from "react";
import { hapticImpact } from "./haptic";

const THRESHOLD = 80; // px to pull before triggering refresh
const MAX_PULL = 120;

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const touchStartY = React.useRef(0);
  const pulling = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    // Only enable pull when scrolled to top
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY < 0) {
      pulling.current = false;
      setPullDistance(0);
      return;
    }
    // Dampen the pull (feels more natural)
    const dampened = Math.min(deltaY * 0.5, MAX_PULL);
    setPullDistance(dampened);

    if (dampened >= THRESHOLD) {
      hapticImpact("light");
    }
  }, [refreshing]);

  const handleTouchEnd = React.useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      hapticImpact("medium");
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative overflow-auto"
      style={{ overscrollBehavior: "contain" }}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: pullDistance > 0 || refreshing ? Math.max(pullDistance, refreshing ? 40 : 0) : 0 }}
      >
        {refreshing ? (
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg
            className="h-5 w-5 text-muted-foreground transition-transform"
            style={{ transform: `rotate(${progress * 180}deg)`, opacity: progress }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
        )}
      </div>

      {children}
    </div>
  );
}
