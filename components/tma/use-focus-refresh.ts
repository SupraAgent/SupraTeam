"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Auto-refresh data when the TMA regains focus.
 *
 * Listens to both the standard `visibilitychange` event and Telegram
 * WebApp's `viewportChanged` event so the hook works in regular browsers
 * as well as inside the Telegram Mini App shell.
 *
 * A minimum interval guard prevents excessive refreshes when the user
 * rapidly switches back and forth.
 */
export function useFocusRefresh(
  onRefresh: () => void | Promise<void>,
  minIntervalMs: number = 30_000,
) {
  const lastRefreshRef = useRef<number>(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const maybeRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < minIntervalMs) return;
    lastRefreshRef.current = now;
    onRefreshRef.current();
  }, [minIntervalMs]);

  useEffect(() => {
    // Standard browser visibility change
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    // Telegram WebApp viewport change (fires when the mini-app becomes visible)
    const tgWebApp = (
      window as unknown as { Telegram?: { WebApp?: { onEvent: (event: string, cb: () => void) => void; offEvent: (event: string, cb: () => void) => void } } }
    ).Telegram?.WebApp;

    if (tgWebApp) {
      tgWebApp.onEvent("viewportChanged", maybeRefresh);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (tgWebApp) {
        tgWebApp.offEvent("viewportChanged", maybeRefresh);
      }
    };
  }, [maybeRefresh]);
}
