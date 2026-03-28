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
  const pullDistanceRef = React.useRef(0); // Track latest distance for touchEnd
  const hapticFired = React.useRef(false); // Prevent haptic spam
  const mountedRef = React.useRef(true);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
    pulling.current = true;
    hapticFired.current = false;
  }, []);

  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY < 0) {
      pulling.current = false;
      setPullDistance(0);
      pullDistanceRef.current = 0;
      return;
    }
    const dampened = Math.min(deltaY * 0.5, MAX_PULL);
    setPullDistance(dampened);
    pullDistanceRef.current = dampened;

    // Fire haptic once when crossing threshold
    if (dampened >= THRESHOLD && !hapticFired.current) {
      hapticFired.current = true;
      hapticImpact("light");
    } else if (dampened < THRESHOLD) {
      hapticFired.current = false;
    }
  }, [refreshing]);

  const handleTouchEnd = React.useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    // Use ref for latest distance (avoids stale closure)
    if (pullDistanceRef.current >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      hapticImpact("medium");
      try {
        await onRefresh();
      } finally {
        if (mountedRef.current) {
          setRefreshing(false);
          setPullDistance(0);
        }
      }
    } else {
      setPullDistance(0);
    }
    pullDistanceRef.current = 0;
  }, [refreshing, onRefresh]);

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
