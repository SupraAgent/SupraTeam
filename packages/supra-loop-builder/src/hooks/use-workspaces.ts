import type { Node, Edge } from "@xyflow/react";
import { uid } from "../lib/utils";
import { syncStorage } from "../lib/storage-context";

export type Workspace = {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
  updatedAt: string;
  /** Version counter for optimistic concurrency control (multi-tab safety). */
  version: number;
};

/**
 * Storage keys — overridden by WorkflowBuilder via setStorageKeys().
 * Note: module-level state means only ONE WorkflowBuilder instance per page
 * can have its own prefix. This matches the single-builder-per-page usage
 * pattern. For multi-instance support, refactor to a React context.
 */
let STORAGE_KEY = "suprateam_loop:workspaces";
let ACTIVE_KEY = "suprateam_loop:active-workspace";

export function setStorageKeys(storageKey: string, activeKey: string) {
  STORAGE_KEY = storageKey;
  ACTIVE_KEY = activeKey;
}

export type WorkspaceSaveError =
  | { type: "quota_exceeded"; message: string }
  | { type: "version_conflict"; message: string }
  | { type: "write_error"; message: string };

let _lastError: WorkspaceSaveError | null = null;

/** Get the last workspace save error, if any. */
export function getLastWorkspaceError(): WorkspaceSaveError | null {
  return _lastError;
}

export function clearWorkspaceError(): void {
  _lastError = null;
}

export function getWorkspaces(): Workspace[] {
  try {
    const raw = syncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error("[@supra/builder] Workspace data corrupted: expected array");
      return [];
    }
    // Backfill version field for legacy data
    return parsed.map((w: Workspace) => ({ ...w, version: w.version ?? 1 }));
  } catch (e) {
    console.error("[@supra/builder] Failed to parse workspaces:", e);
    return [];
  }
}

/** Returns true if save succeeded, false on failure. Sets _lastError on failure. */
function saveAll(workspaces: Workspace[]): boolean {
  try {
    syncStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    _lastError = null;
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      _lastError = {
        type: "quota_exceeded",
        message: "localStorage is full. Cannot save workspace. Free up space by deleting unused workspaces or templates.",
      };
    } else {
      _lastError = {
        type: "write_error",
        message: `Failed to save workspaces: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    console.error("[@supra/builder] Failed to save workspaces:", e);
    return false;
  }
}

export function getActiveWorkspaceId(): string | null {
  return syncStorage.getItem(ACTIVE_KEY);
}

export function setActiveWorkspaceId(id: string | null): void {
  try {
    if (id) {
      syncStorage.setItem(ACTIVE_KEY, id);
    } else {
      syncStorage.removeItem(ACTIVE_KEY);
    }
  } catch (e) {
    console.warn("[@supra/builder] Failed to update active workspace ID:", e);
  }
}

/** Returns the created workspace. Warns if persistence failed. */
export function createWorkspace(
  name: string,
  nodes: Node[],
  edges: Edge[]
): Workspace | null {
  const now = new Date().toISOString();
  const ws: Workspace = {
    id: uid("ws"),
    name,
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const all = getWorkspaces();
  all.push(ws);
  if (!saveAll(all)) {
    console.warn("[@supra/builder] createWorkspace: failed to persist — localStorage may be full");
    return null;
  }
  return ws;
}

/**
 * Save workspace data with optimistic concurrency control.
 * Pass `expectedVersion` to detect multi-tab conflicts.
 * Returns false if localStorage write failed or version conflict detected.
 */
export function saveWorkspace(
  id: string,
  nodes: Node[],
  edges: Edge[],
  expectedVersion?: number
): boolean {
  const all = getWorkspaces();
  const idx = all.findIndex((w) => w.id === id);
  const now = new Date().toISOString();

  if (idx < 0) {
    all.push({
      id,
      name: "Recovered Build",
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  } else {
    // Multi-tab race condition check
    if (expectedVersion !== undefined && all[idx].version !== expectedVersion) {
      _lastError = {
        type: "version_conflict",
        message: "Workspace was modified in another tab. Reload to get the latest version.",
      };
      return false;
    }
    all[idx] = {
      ...all[idx],
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      updatedAt: now,
      version: (all[idx].version ?? 1) + 1,
    };
  }
  return saveAll(all);
}

export function renameWorkspace(id: string, name: string): boolean {
  const all = getWorkspaces();
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return false;
  all[idx] = { ...all[idx], name, updatedAt: new Date().toISOString() };
  return saveAll(all);
}

export function deleteWorkspace(id: string): boolean {
  const all = getWorkspaces().filter((w) => w.id !== id);
  const saved = saveAll(all);
  if (getActiveWorkspaceId() === id) {
    setActiveWorkspaceId(null);
  }
  return saved;
}

export function duplicateWorkspace(id: string): Workspace | null {
  const all = getWorkspaces();
  const source = all.find((w) => w.id === id);
  if (!source) return null;
  const now = new Date().toISOString();
  const copy: Workspace = {
    id: uid("ws"),
    name: `${source.name} (copy)`,
    nodes: JSON.parse(JSON.stringify(source.nodes)),
    edges: JSON.parse(JSON.stringify(source.edges)),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  all.push(copy);
  if (!saveAll(all)) {
    console.warn("[@supra/builder] duplicateWorkspace: failed to persist — localStorage may be full");
    return null;
  }
  return copy;
}

export function loadWorkspace(id: string): Workspace | null {
  return getWorkspaces().find((w) => w.id === id) ?? null;
}
