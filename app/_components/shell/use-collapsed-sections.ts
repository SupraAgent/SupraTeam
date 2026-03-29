"use client";

import * as React from "react";

const STORAGE_KEY = "supracrm:collapsed-sections";

export function useCollapsedSections() {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCollapsed(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  const toggle = React.useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
