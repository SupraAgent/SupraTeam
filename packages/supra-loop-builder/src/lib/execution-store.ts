/**
 * Execution Store — Sprint 4
 *
 * Persists full execution results to IndexedDB via StorageAdapter.
 * Dual-write: summary → localStorage (fast UI), full data → IndexedDB (replay/compare).
 *
 * Features:
 * - Schema versioned (`_v` field) for forward-compatible migrations
 * - Async mutex to prevent read-modify-write races on the index
 * - 2MB per execution cap, 100KB per step output truncation
 * - Secret redaction on all persisted outputs (including structuredOutput)
 * - Deduplication guard on execution IDs
 * - Rollback on dual-write desync
 */

import type { WorkflowExecution, WorkflowStepResult } from "./workflow-engine";
import { getStorageAdapter } from "./storage-context";
import { sanitizeErrorMessage } from "./utils";

// ── Schema version ───────────────────────────────────────────────

const SCHEMA_VERSION = 1;

// ── Size limits ──────────────────────────────────────────────────

const MAX_EXECUTION_SIZE = 2 * 1024 * 1024; // 2MB per execution
const MAX_STEP_OUTPUT_SIZE = 100 * 1024; // 100KB per step output
const MAX_INDEX_ENTRIES = 200;

// ── Types ────────────────────────────────────────────────────────

export type PersistedStep = {
  nodeId: string;
  nodeType: string;
  label: string;
  status: WorkflowStepResult["status"];
  output?: string;
  structuredOutput?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  tokenUsage?: { input: number; output: number; cost: number };
  retryCount?: number;
};

export type PersistedExecution = {
  _v: number;
  id: string;
  workspaceId: string;
  status: WorkflowExecution["status"];
  steps: PersistedStep[];
  startedAt: string;
  completedAt?: string;
  totalTokens?: { input: number; output: number; cost: number };
  nodeIds: string[];
  edgeIds: string[];
  createdAt: string;
};

export type ExecutionIndexEntry = {
  id: string;
  workspaceId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  stepCount: number;
  successCount: number;
  errorCount: number;
  totalTokens?: { input: number; output: number; cost: number };
};

export type ExecutionComparison = {
  a: PersistedExecution;
  b: PersistedExecution;
  stepDiffs: Array<{
    nodeId: string;
    label: string;
    statusA: string;
    statusB: string;
    outputChanged: boolean;
  }>;
  tokenDelta: { input: number; output: number; cost: number };
};

// ── Storage key helpers ──────────────────────────────────────────

let _prefix = "athena";

export function setExecutionStorePrefix(prefix: string): void {
  _prefix = prefix;
}

function indexKey(): string {
  return `${_prefix}:exec-index`;
}

function executionKey(id: string): string {
  // Sanitize ID to prevent key namespace collisions
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${_prefix}:exec:${safeId}`;
}

// ── Async mutex ──────────────────────────────────────────────────

let _indexLock: Promise<void> = Promise.resolve();

function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = _indexLock;
  _indexLock = next;
  return prev.then(fn).finally(() => release!());
}

// ── Secret redaction ─────────────────────────────────────────────

const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9-]+/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /sk_live_[a-zA-Z0-9]{20,}/g,
  /sk_test_[a-zA-Z0-9]{20,}/g,
  /AIza[a-zA-Z0-9_-]{35}/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/gi,
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /xoxb-[a-zA-Z0-9-]+/g,
  /xoxp-[a-zA-Z0-9-]+/g,
];

function redactSecrets(text: string): string {
  let result = sanitizeErrorMessage(text);
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * Deep-walk an unknown value and redact any string fields containing secrets.
 * Returns a new value (does not mutate input). Depth-limited to prevent stack overflow.
 */
function redactStructured(value: unknown, depth = 0): unknown {
  if (depth > 30) return "[too deep]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSecrets(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactStructured(v, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Prototype pollution guard
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      result[k] = redactStructured(v, depth + 1);
    }
    return result;
  }
  return value;
}

function redactStep(step: WorkflowStepResult): PersistedStep {
  return {
    nodeId: step.nodeId,
    nodeType: step.nodeType,
    label: step.label,
    status: step.status,
    output: step.output
      ? redactSecrets(step.output.slice(0, MAX_STEP_OUTPUT_SIZE))
      : undefined,
    structuredOutput: step.structuredOutput != null
      ? redactStructured(step.structuredOutput)
      : undefined,
    error: step.error ? redactSecrets(step.error) : undefined,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    tokenUsage: step.tokenUsage,
    retryCount: step.retryCount,
  };
}

// ── Index operations (localStorage for fast reads) ───────────────

function readIndex(): ExecutionIndexEntry[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(indexKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Basic schema validation
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown) =>
        typeof e === "object" && e !== null && "id" in e && "workspaceId" in e
    ) as ExecutionIndexEntry[];
  } catch {
    return [];
  }
}

/** Write index to localStorage. Returns true on success, false on failure. */
function writeIndex(entries: ExecutionIndexEntry[]): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(
      indexKey(),
      JSON.stringify(entries.slice(0, MAX_INDEX_ENTRIES))
    );
    return true;
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Save a completed execution. Writes full data to IndexedDB first,
 * then summary to localStorage index. Rolls back IndexedDB on index failure.
 */
export async function saveExecution(
  execution: WorkflowExecution,
  workspaceId: string,
  nodeIds: string[],
  edgeIds: string[]
): Promise<void> {
  const persisted: PersistedExecution = {
    _v: SCHEMA_VERSION,
    id: execution.id,
    workspaceId,
    status: execution.status,
    steps: execution.steps.map(redactStep),
    startedAt: execution.startedAt ?? new Date().toISOString(),
    completedAt: execution.completedAt,
    totalTokens: execution.totalTokens,
    nodeIds: [...nodeIds],
    edgeIds: [...edgeIds],
    createdAt: new Date().toISOString(),
  };

  // Enforce 2MB size limit with re-check after truncation
  let serialized = JSON.stringify(persisted);
  if (serialized.length > MAX_EXECUTION_SIZE) {
    for (const step of persisted.steps) {
      if (step.output && step.output.length > 1000) {
        step.output = step.output.slice(0, 1000) + "\n[truncated]";
      }
      step.structuredOutput = undefined;
    }
    serialized = JSON.stringify(persisted);
    // If still too large, drop all step outputs
    if (serialized.length > MAX_EXECUTION_SIZE) {
      for (const step of persisted.steps) {
        step.output = step.output ? "[dropped — execution too large]" : undefined;
      }
      serialized = JSON.stringify(persisted);
    }
  }

  // Write full data to IndexedDB first
  const adapter = getStorageAdapter();
  const eKey = executionKey(execution.id);
  await adapter.setItem(eKey, serialized);

  // Write summary to localStorage index (with mutex + dedupe)
  // If index write fails, roll back IndexedDB entry
  await withIndexLock(async () => {
    const index = readIndex();

    // Dedupe guard
    if (index.some((e) => e.id === execution.id)) {
      return;
    }

    const entry: ExecutionIndexEntry = {
      id: execution.id,
      workspaceId,
      status: execution.status,
      startedAt: persisted.startedAt,
      completedAt: execution.completedAt,
      stepCount: execution.steps.length,
      successCount: execution.steps.filter((s) => s.status === "success").length,
      errorCount: execution.steps.filter((s) => s.status === "error").length,
      totalTokens: execution.totalTokens,
    };

    index.unshift(entry);
    const ok = writeIndex(index);
    if (!ok) {
      // Rollback IndexedDB to prevent ghost entries
      adapter.removeItem(eKey).catch(() => {});
    }
  });
}

/**
 * Load the full persisted execution from IndexedDB.
 */
export async function loadExecution(
  id: string
): Promise<PersistedExecution | null> {
  const adapter = getStorageAdapter();
  const raw = await adapter.getItem(executionKey(id));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    // Basic schema validation
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.id !== "string" ||
      !Array.isArray(parsed.steps)
    ) {
      return null;
    }
    return parsed as PersistedExecution;
  } catch {
    return null;
  }
}

/**
 * List execution summaries for a workspace (from localStorage index).
 */
export function listExecutions(workspaceId?: string): ExecutionIndexEntry[] {
  const index = readIndex();
  if (!workspaceId) return index;
  return index.filter((e) => e.workspaceId === workspaceId);
}

/**
 * Compare two executions step-by-step.
 */
export async function compareExecutions(
  idA: string,
  idB: string
): Promise<ExecutionComparison | null> {
  const [a, b] = await Promise.all([loadExecution(idA), loadExecution(idB)]);
  if (!a || !b) return null;

  // Build step map for B
  const bStepMap = new Map(b.steps.map((s) => [s.nodeId, s]));

  const stepDiffs: ExecutionComparison["stepDiffs"] = a.steps.map((stepA) => {
    const stepB = bStepMap.get(stepA.nodeId);
    return {
      nodeId: stepA.nodeId,
      label: stepA.label,
      statusA: stepA.status as string,
      statusB: (stepB?.status ?? "missing") as string,
      outputChanged: stepA.output !== stepB?.output,
    };
  });

  // Include steps in B that aren't in A
  for (const stepB of b.steps) {
    if (!a.steps.some((s) => s.nodeId === stepB.nodeId)) {
      stepDiffs.push({
        nodeId: stepB.nodeId,
        label: stepB.label,
        statusA: "missing",
        statusB: stepB.status,
        outputChanged: true,
      });
    }
  }

  const tokA = a.totalTokens ?? { input: 0, output: 0, cost: 0 };
  const tokB = b.totalTokens ?? { input: 0, output: 0, cost: 0 };

  return {
    a,
    b,
    stepDiffs,
    tokenDelta: {
      input: tokB.input - tokA.input,
      output: tokB.output - tokA.output,
      cost: tokB.cost - tokA.cost,
    },
  };
}

/**
 * Delete a single execution from both IndexedDB and the localStorage index.
 */
export async function deleteExecution(id: string): Promise<void> {
  const adapter = getStorageAdapter();
  await adapter.removeItem(executionKey(id));

  await withIndexLock(async () => {
    const index = readIndex();
    const filtered = index.filter((e) => e.id !== id);
    writeIndex(filtered);
  });
}

/**
 * Clear all executions for a workspace.
 * Entire operation runs inside the lock to prevent desync.
 */
export async function clearWorkspaceExecutions(
  workspaceId: string
): Promise<void> {
  await withIndexLock(async () => {
    const index = readIndex();
    const toDelete = index.filter((e) => e.workspaceId === workspaceId);
    const toKeep = index.filter((e) => e.workspaceId !== workspaceId);

    const adapter = getStorageAdapter();
    await Promise.all(
      toDelete.map((e) => adapter.removeItem(executionKey(e.id)))
    );

    writeIndex(toKeep);
  });
}
