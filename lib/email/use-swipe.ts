"use client";

import * as React from "react";

type SwipeDirection = "left" | "right" | null;

type UseSwipeOptions = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // px to trigger swipe
};

type SwipeState = {
  offset: number;
  direction: SwipeDirection;
  swiping: boolean;
};

/**
 * Hook for swipe gestures on touch devices.
 * Returns a ref to attach to the swipeable element and current swipe state.
 */
export function useSwipe<T extends HTMLElement>(options: UseSwipeOptions) {
  const ref = React.useRef<T>(null);
  const [state, setState] = React.useState<SwipeState>({ offset: 0, direction: null, swiping: false });
  const startXRef = React.useRef(0);
  const startYRef = React.useRef(0);
  const isTrackingRef = React.useRef(false);
  const threshold = options.threshold ?? 80;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      isTrackingRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - startXRef.current;
      const dy = e.touches[0].clientY - startYRef.current;

      // Only track horizontal swipes (ignore vertical scrolling)
      if (!isTrackingRef.current) {
        if (Math.abs(dy) > Math.abs(dx)) return; // Vertical — ignore
        if (Math.abs(dx) > 10) isTrackingRef.current = true;
        else return;
      }

      e.preventDefault(); // Prevent scroll while swiping

      const clamped = Math.max(-150, Math.min(150, dx));
      setState({
        offset: clamped,
        direction: clamped > 0 ? "right" : clamped < 0 ? "left" : null,
        swiping: true,
      });
    }

    function onTouchEnd() {
      if (!isTrackingRef.current) return;

      const { offset, direction } = stateRef.current;
      if (Math.abs(offset) >= threshold) {
        if (direction === "left" && options.onSwipeLeft) {
          options.onSwipeLeft();
        } else if (direction === "right" && options.onSwipeRight) {
          options.onSwipeRight();
        }
      }

      setState({ offset: 0, direction: null, swiping: false });
      isTrackingRef.current = false;
    }

    // Need a ref to current state for the touchend handler
    const stateRef = { current: state };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [options.onSwipeLeft, options.onSwipeRight, threshold, state]);

  return { ref, ...state };
}
