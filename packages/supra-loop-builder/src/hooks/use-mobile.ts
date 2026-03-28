import * as React from "react";

const MQ = "(pointer: coarse)";

function subscribe(callback: () => void): () => void {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(MQ).matches;
}

function getServerSnapshot(): boolean {
  return false; // SSR: assume desktop, hydration will correct on client
}

/**
 * Detect coarse pointer (touch-primary) devices using matchMedia.
 * Uses useSyncExternalStore to avoid hydration mismatches and
 * unnecessary re-renders from useState+useEffect pattern.
 *
 * Returns true on phones/tablets, false on desktop (even with touchscreen
 * if mouse is primary). Does NOT use 'ontouchstart' which fires true on
 * hybrid devices like Surface.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
