"use client";

import * as React from "react";

/** Detect touch device and mobile viewport — self-contained, no external deps */
export function useTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const touch =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(touch);

    function checkMobile() {
      setIsMobile(window.innerWidth < 768);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return { isTouchDevice, isMobile };
}

/** Coordinates captured synchronously from a touch event */
export type TouchCoords = { clientX: number; clientY: number };

/** Long-press hook — returns handlers to attach to an element */
export function useLongPress(
  callback: (coords: TouchCoords) => void,
  ms = 500
) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  // Clean up timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      // Capture coordinates synchronously — synthetic events are recycled after handler returns
      const touch = e.touches[0];
      if (!touch) return;
      const coords: TouchCoords = { clientX: touch.clientX, clientY: touch.clientY };
      timerRef.current = setTimeout(() => {
        callbackRef.current(coords);
      }, ms);
    },
    [ms]
  );

  const onTouchEnd = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchMove = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onTouchStart, onTouchEnd, onTouchMove };
}

/** Swipe-down-to-dismiss for bottom sheets. Returns props to spread on the handle/container. */
export function useSwipeToDismiss(onDismiss: () => void, threshold = 80) {
  const startYRef = React.useRef<number | null>(null);
  const currentYRef = React.useRef<number>(0);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;

  const onTouchStart = React.useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = 0;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    // Only allow downward drag
    currentYRef.current = Math.max(0, delta);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${currentYRef.current}px)`;
    }
  }, []);

  const onTouchEnd = React.useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.2s ease-out";
    }
    if (currentYRef.current > threshold) {
      // Dismiss — slide fully out then call callback
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translateY(100%)`;
      }
      setTimeout(() => dismissRef.current(), 200);
    } else {
      // Snap back
      if (sheetRef.current) {
        sheetRef.current.style.transform = "translateY(0)";
      }
    }
    startYRef.current = null;
    currentYRef.current = 0;
  }, [threshold]);

  return { sheetRef, handleProps: { onTouchStart, onTouchMove, onTouchEnd } };
}
