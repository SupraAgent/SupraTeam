import * as React from "react";

// Detect mobile via coarse pointer OR narrow viewport (< 768px).
// Some mobile browsers (especially in-app WebViews) don't report pointer: coarse.
const MQ = "(pointer: coarse), (max-width: 767px)";

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
 * Detect mobile devices using matchMedia.
 * Returns true when either:
 *   - pointer: coarse (touch-primary device)
 *   - viewport width < 768px (narrow screen fallback)
 *
 * Uses useSyncExternalStore to avoid hydration mismatches.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
