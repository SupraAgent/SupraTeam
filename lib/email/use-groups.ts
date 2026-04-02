"use client";

import * as React from "react";
import type { Label } from "./types";

const STORAGE_KEY = "email-groups-visible";
const COLLAPSED_KEY = "email-groups-collapsed";
const SORT_KEY = "email-groups-sort";

type SortOrder = "newest" | "oldest";

interface UseGroupsResult {
  visibleGroups: Label[];
  hiddenGroups: Label[];
  addGroup: (labelId: string) => void;
  removeGroup: (labelId: string) => void;
  collapsedGroups: Set<string>;
  toggleCollapsed: (labelId: string) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  initialized: boolean;
}

function loadSet(key: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return new Set(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch { /* noop */ }
}

export function useGroups(labels: Label[]): UseGroupsResult {
  const userLabels = React.useMemo(() => labels.filter((l) => l.type === "user"), [labels]);

  const [visibleIds, setVisibleIds] = React.useState<Set<string>>(() => {
    const stored = loadSet(STORAGE_KEY);
    return stored ?? new Set<string>();
  });

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => {
    return loadSet(COLLAPSED_KEY) ?? new Set<string>();
  });

  const [sortOrder, setSortOrderState] = React.useState<SortOrder>(() => {
    if (typeof window === "undefined") return "newest";
    try {
      return (localStorage.getItem(SORT_KEY) as SortOrder) ?? "newest";
    } catch {
      return "newest";
    }
  });

  const [initialized, setInitialized] = React.useState(false);

  // Auto-populate on first load when no stored preferences exist
  React.useEffect(() => {
    if (userLabels.length === 0) return;
    const stored = loadSet(STORAGE_KEY);
    if (!stored) {
      // First load — show all user labels as groups
      const allIds = new Set(userLabels.map((l) => l.id));
      setVisibleIds(allIds);
      saveSet(STORAGE_KEY, allIds);
    }
    setInitialized(true);
  }, [userLabels]);

  const visibleGroups = React.useMemo(
    () => userLabels.filter((l) => visibleIds.has(l.id)),
    [userLabels, visibleIds]
  );

  const hiddenGroups = React.useMemo(
    () => userLabels.filter((l) => !visibleIds.has(l.id)),
    [userLabels, visibleIds]
  );

  const addGroup = React.useCallback((labelId: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      next.add(labelId);
      saveSet(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const removeGroup = React.useCallback((labelId: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      next.delete(labelId);
      saveSet(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleCollapsed = React.useCallback((labelId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      saveSet(COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const setSortOrder = React.useCallback((order: SortOrder) => {
    setSortOrderState(order);
    try { localStorage.setItem(SORT_KEY, order); } catch { /* noop */ }
  }, []);

  return {
    visibleGroups,
    hiddenGroups,
    addGroup,
    removeGroup,
    collapsedGroups,
    toggleCollapsed,
    sortOrder,
    setSortOrder,
    initialized,
  };
}
