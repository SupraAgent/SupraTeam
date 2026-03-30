"use client";

import * as React from "react";
import type { PanelId, PanelLayoutState } from "./types";
import { getDefaultLayout } from "./registry";

const STORAGE_KEY = "supracrm:email-dashboard-layout";

export function useDashboardLayout() {
  const [layout, setLayout] = React.useState<PanelLayoutState>(() => {
    if (typeof window === "undefined") return { enabledPanels: getDefaultLayout() };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored) as PanelLayoutState;
    } catch { /* ignore */ }
    return { enabledPanels: getDefaultLayout() };
  });

  const persist = React.useCallback((next: PanelLayoutState) => {
    setLayout(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const togglePanel = React.useCallback((id: PanelId) => {
    setLayout((prev) => {
      const enabled = prev.enabledPanels.includes(id)
        ? prev.enabledPanels.filter((p) => p !== id)
        : [...prev.enabledPanels, id];
      const next = { enabledPanels: enabled };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetLayout = React.useCallback(() => {
    persist({ enabledPanels: getDefaultLayout() });
  }, [persist]);

  return { layout, togglePanel, resetLayout };
}

export function useEmailDashboardKeys(handlers: {
  onToggleDashboard: () => void;
  onRefresh: () => void;
}, enabled: boolean) {
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  React.useEffect(() => {
    if (!enabled) return;
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey) return;

      switch (e.key) {
        case "d":
          e.preventDefault();
          handlersRef.current.onToggleDashboard();
          break;
        case "r":
          e.preventDefault();
          handlersRef.current.onRefresh();
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled]);
}
