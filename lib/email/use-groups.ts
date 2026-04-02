"use client";

import * as React from "react";
import type { Label } from "./types";

const STORAGE_KEY = "email-groups-visible";
const ORDER_KEY = "email-groups-order";
const COLLAPSED_KEY = "email-groups-collapsed";
const SORT_KEY = "email-groups-sort";

type SortOrder = "newest" | "oldest";

interface UseGroupsResult {
  visibleGroups: Label[];
  hiddenGroups: Label[];
  addGroup: (labelId: string) => void;
  removeGroup: (labelId: string) => void;
  reorderGroup: (fromIndex: number, toIndex: number) => void;
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

function loadArray(key: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveArray(key: string, arr: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch { /* noop */ }
}

// Third-party labels use bracket prefixes like [Superhuman]/Snoozed, [Streak]/Tracked
function isThirdPartyLabel(name: string): boolean {
  return name.startsWith("[");
}

export function useGroups(labels: Label[]): UseGroupsResult {
  const userLabels = React.useMemo(() => labels.filter((l) => l.type === "user"), [labels]);

  const [visibleIds, setVisibleIds] = React.useState<Set<string>>(() => {
    const stored = loadSet(STORAGE_KEY);
    return stored ?? new Set<string>();
  });

  // Ordered list of visible group IDs (for drag reorder)
  const [orderedIds, setOrderedIds] = React.useState<string[]>(() => {
    return loadArray(ORDER_KEY) ?? [];
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

  // Auto-populate on first load, and auto-add any new labels not yet tracked
  React.useEffect(() => {
    if (userLabels.length === 0) return;
    const stored = loadSet(STORAGE_KEY);
    if (!stored) {
      // First load — show all user labels except third-party ones
      const nonThirdParty = userLabels.filter((l) => !isThirdPartyLabel(l.name));
      const allIds = new Set(nonThirdParty.map((l) => l.id));
      const allOrder = nonThirdParty.map((l) => l.id);
      setVisibleIds(allIds);
      setOrderedIds(allOrder);
      saveSet(STORAGE_KEY, allIds);
      saveArray(ORDER_KEY, allOrder);
    } else {
      // Auto-add labels that appeared since last visit (skip third-party)
      const newIds = userLabels.filter((l) => !stored.has(l.id) && !isThirdPartyLabel(l.name)).map((l) => l.id);
      if (newIds.length > 0) {
        setVisibleIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) next.add(id);
          saveSet(STORAGE_KEY, next);
          return next;
        });
        setOrderedIds((prev) => {
          const next = [...prev, ...newIds];
          saveArray(ORDER_KEY, next);
          return next;
        });
      }
    }
    setInitialized(true);
  }, [userLabels]);

  // Visible groups in user-defined order
  const visibleGroups = React.useMemo(() => {
    const labelMap = new Map(userLabels.map((l) => [l.id, l]));
    // Use orderedIds for ordering, filter to only visible ones that still exist
    const ordered: Label[] = [];
    for (const id of orderedIds) {
      if (visibleIds.has(id) && labelMap.has(id)) {
        ordered.push(labelMap.get(id)!);
      }
    }
    // Add any visible IDs not in the order list (fallback)
    for (const l of userLabels) {
      if (visibleIds.has(l.id) && !orderedIds.includes(l.id)) {
        ordered.push(l);
      }
    }
    return ordered;
  }, [userLabels, visibleIds, orderedIds]);

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
    setOrderedIds((prev) => {
      if (prev.includes(labelId)) return prev;
      const next = [...prev, labelId];
      saveArray(ORDER_KEY, next);
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

  const reorderGroup = React.useCallback((fromIndex: number, toIndex: number) => {
    setOrderedIds((prev) => {
      // Build the visible-only ordered list to map indices correctly
      const visibleOrder = prev.filter((id) => visibleIds.has(id));
      if (fromIndex < 0 || fromIndex >= visibleOrder.length || toIndex < 0 || toIndex >= visibleOrder.length) return prev;
      const movedId = visibleOrder[fromIndex];
      visibleOrder.splice(fromIndex, 1);
      visibleOrder.splice(toIndex, 0, movedId);
      // Merge back: keep hidden IDs in original positions, replace visible positions
      const hiddenOrder = prev.filter((id) => !visibleIds.has(id));
      const next = [...visibleOrder, ...hiddenOrder];
      saveArray(ORDER_KEY, next);
      return next;
    });
  }, [visibleIds]);

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
    reorderGroup,
    collapsedGroups,
    toggleCollapsed,
    sortOrder,
    setSortOrder,
    initialized,
  };
}
