/**
 * Workflow Versioning — Sprint 4
 *
 * Snapshot-based save points for workflow canvases.
 * Each version captures the full node/edge state at a point in time.
 *
 * Features:
 * - UUID-based version IDs (no counter collision risk)
 * - Monotonic display numbering per workspace (survives deletions)
 * - Create, list, load, delete, rename versions
 * - Diff between two versions (stable JSON comparison, depth-limited)
 * - Async mutex to prevent index race conditions
 * - Size cap on version snapshots (4MB)
 */

import type { Node, Edge } from "@xyflow/react";
import { getStorageAdapter } from "./storage-context";
import { uid } from "./utils";

// ── Size limits ──────────────────────────────────────────────────

const MAX_VERSION_SIZE = 4 * 1024 * 1024; // 4MB per version snapshot
const MAX_VERSION_INDEX_ENTRIES = 100;

// ── Types ────────────────────────────────────────────────────────

export type WorkflowVersion = {
  id: string;
  workspaceId: string;
  version: number;
  name: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
};

export type VersionIndexEntry = {
  id: string;
  workspaceId: string;
  version: number;
  name: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
};

export type VersionDiff = {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
  summary: string;
};

// ── Storage key helpers ──────────────────────────────────────────

let _prefix = "suprateam_loop";

export function setVersionStorePrefix(prefix: string): void {
  _prefix = prefix;
}

function versionIndexKey(workspaceId: string): string {
  return `${_prefix}:ver-index:${workspaceId}`;
}

function versionDataKey(id: string): string {
  return `${_prefix}:ver:${id}`;
}

function counterKey(workspaceId: string): string {
  return `${_prefix}:ver-counter:${workspaceId}`;
}

// ── Async mutex ──────────────────────────────────────────────────

let _versionLock: Promise<void> = Promise.resolve();

function withVersionLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = _versionLock;
  _versionLock = next;
  return prev.then(fn).finally(() => release!());
}

// ── Monotonic counter (display number only, not used for ID uniqueness) ──

function getNextVersion(workspaceId: string): number {
  try {
    if (typeof window === "undefined") return 1;
    const key = counterKey(workspaceId);
    const current = parseInt(window.localStorage.getItem(key) ?? "0", 10);
    const next = (Number.isFinite(current) ? current : 0) + 1;
    window.localStorage.setItem(key, String(next));
    return next;
  } catch {
    // If localStorage fails, derive from existing index to stay consistent
    const index = readVersionIndex(workspaceId);
    const maxExisting = index.reduce((max, e) => Math.max(max, e.version), 0);
    return maxExisting + 1;
  }
}

// ── Index operations (localStorage for fast reads) ───────────────

function readVersionIndex(workspaceId: string): VersionIndexEntry[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(versionIndexKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown) =>
        typeof e === "object" && e !== null && "id" in e && "workspaceId" in e
    ) as VersionIndexEntry[];
  } catch {
    return [];
  }
}

function writeVersionIndex(
  workspaceId: string,
  entries: VersionIndexEntry[]
): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      versionIndexKey(workspaceId),
      JSON.stringify(entries.slice(0, MAX_VERSION_INDEX_ENTRIES))
    );
  } catch {
    // localStorage full — non-fatal
  }
}

// ── Stable JSON stringify (sorted keys, depth-limited) ───────────

function stableStringify(value: unknown, depth = 0): string {
  if (depth > 50) return '"[too deep]"';
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => stableStringify(v, depth + 1)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const sorted = Object.keys(obj)
    .filter((k) => k !== "__proto__" && k !== "constructor" && k !== "prototype")
    .sort();
  const pairs = sorted.map(
    (k) => JSON.stringify(k) + ":" + stableStringify(obj[k], depth + 1)
  );
  return "{" + pairs.join(",") + "}";
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Create a new version snapshot for a workspace.
 * Uses UUID for the version ID (collision-safe) and a monotonic counter
 * for the display number only.
 */
export async function createVersion(
  workspaceId: string,
  name: string,
  nodes: Node[],
  edges: Edge[]
): Promise<WorkflowVersion> {
  const version: WorkflowVersion = await withVersionLock(async () => {
    const versionNum = getNextVersion(workspaceId);
    const id = uid("ver");

    const clonedNodes = JSON.parse(JSON.stringify(nodes));
    const clonedEdges = JSON.parse(JSON.stringify(edges));

    const ver: WorkflowVersion = {
      id,
      workspaceId,
      version: versionNum,
      name: name || `v${versionNum}`,
      nodes: clonedNodes,
      edges: clonedEdges,
      createdAt: new Date().toISOString(),
    };

    // Enforce size limit
    const serialized = JSON.stringify(ver);
    if (serialized.length > MAX_VERSION_SIZE) {
      throw new Error(
        `Version snapshot exceeds ${MAX_VERSION_SIZE / (1024 * 1024)}MB limit ` +
        `(${(serialized.length / (1024 * 1024)).toFixed(1)}MB). ` +
        `Reduce workflow complexity before saving a version.`
      );
    }

    // Write full data to IndexedDB
    const adapter = getStorageAdapter();
    await adapter.setItem(versionDataKey(id), serialized);

    // Update index
    const index = readVersionIndex(workspaceId);
    index.unshift({
      id,
      workspaceId,
      version: versionNum,
      name: ver.name,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      createdAt: ver.createdAt,
    });
    writeVersionIndex(workspaceId, index);

    return ver;
  });

  return version;
}

/**
 * List version summaries for a workspace.
 */
export function listVersions(workspaceId: string): VersionIndexEntry[] {
  return readVersionIndex(workspaceId);
}

/**
 * Load the full version data from IndexedDB.
 */
export async function loadVersion(
  id: string
): Promise<WorkflowVersion | null> {
  const adapter = getStorageAdapter();
  const raw = await adapter.getItem(versionDataKey(id));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }
    return parsed as WorkflowVersion;
  } catch {
    return null;
  }
}

/**
 * Delete a version. Monotonic counter is not decremented.
 */
export async function deleteVersion(
  id: string,
  workspaceId: string
): Promise<void> {
  await withVersionLock(async () => {
    const adapter = getStorageAdapter();
    await adapter.removeItem(versionDataKey(id));

    const index = readVersionIndex(workspaceId);
    const filtered = index.filter((e) => e.id !== id);
    writeVersionIndex(workspaceId, filtered);
  });
}

/**
 * Rename a version.
 */
export async function renameVersion(
  id: string,
  workspaceId: string,
  newName: string
): Promise<void> {
  await withVersionLock(async () => {
    // Update index entry
    const index = readVersionIndex(workspaceId);
    const entry = index.find((e) => e.id === id);
    if (entry) {
      entry.name = newName;
      writeVersionIndex(workspaceId, index);
    }

    // Update full data
    const adapter = getStorageAdapter();
    const raw = await adapter.getItem(versionDataKey(id));
    if (raw) {
      try {
        const ver = JSON.parse(raw) as WorkflowVersion;
        ver.name = newName;
        await adapter.setItem(versionDataKey(id), JSON.stringify(ver));
      } catch {
        // parse error — skip
      }
    }
  });
}

/**
 * Diff two versions. Returns added/removed/modified nodes and edges.
 */
export async function diffVersions(
  idA: string,
  idB: string
): Promise<VersionDiff | null> {
  const [a, b] = await Promise.all([loadVersion(idA), loadVersion(idB)]);
  if (!a || !b) return null;

  const aNodeIds = new Set(a.nodes.map((n) => n.id));
  const bNodeIds = new Set(b.nodes.map((n) => n.id));
  const aEdgeIds = new Set(a.edges.map((e) => e.id));
  const bEdgeIds = new Set(b.edges.map((e) => e.id));

  const nodesAdded = b.nodes
    .filter((n) => !aNodeIds.has(n.id))
    .map((n) => n.id);
  const nodesRemoved = a.nodes
    .filter((n) => !bNodeIds.has(n.id))
    .map((n) => n.id);

  // Check for modified nodes (same ID, different data)
  const aNodeMap = new Map(a.nodes.map((n) => [n.id, n]));
  const nodesModified: string[] = [];
  for (const bNode of b.nodes) {
    const aNode = aNodeMap.get(bNode.id);
    if (aNode && stableStringify(aNode.data) !== stableStringify(bNode.data)) {
      nodesModified.push(bNode.id);
    }
  }

  const edgesAdded = b.edges
    .filter((e) => !aEdgeIds.has(e.id))
    .map((e) => e.id);
  const edgesRemoved = a.edges
    .filter((e) => !bEdgeIds.has(e.id))
    .map((e) => e.id);

  const parts: string[] = [];
  if (nodesAdded.length) parts.push(`+${nodesAdded.length} nodes`);
  if (nodesRemoved.length) parts.push(`-${nodesRemoved.length} nodes`);
  if (nodesModified.length) parts.push(`~${nodesModified.length} nodes modified`);
  if (edgesAdded.length) parts.push(`+${edgesAdded.length} edges`);
  if (edgesRemoved.length) parts.push(`-${edgesRemoved.length} edges`);

  return {
    nodesAdded,
    nodesRemoved,
    nodesModified,
    edgesAdded,
    edgesRemoved,
    summary: parts.length ? parts.join(", ") : "No changes",
  };
}

/**
 * Clear all versions for a workspace (for workspace deletion cleanup).
 */
export async function clearWorkspaceVersions(
  workspaceId: string
): Promise<void> {
  await withVersionLock(async () => {
    const index = readVersionIndex(workspaceId);
    const adapter = getStorageAdapter();

    await Promise.all(
      index.map((e) => adapter.removeItem(versionDataKey(e.id)))
    );

    writeVersionIndex(workspaceId, []);

    // Clear counter
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(counterKey(workspaceId));
      }
    } catch {
      // non-fatal
    }
  });
}
