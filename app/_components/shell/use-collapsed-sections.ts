"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "supracrm-nav-sections";

export function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCollapsed(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
