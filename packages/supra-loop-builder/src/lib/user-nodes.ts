/**
 * User Nodes — custom node types created by users (via AI chat or manually).
 * Persisted to localStorage per storage-key prefix.
 */

import { uid } from "./utils";
import { syncStorage } from "./storage-context";

// ── Types ────────────────────────────────────────────────────────

export type UserNodeField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "boolean";
  /** Default value for new instances */
  defaultValue: string | number | boolean;
  /** Options for "select" type */
  options?: string[];
  /** Placeholder text */
  placeholder?: string;
};

export type UserNodeDefinition = {
  id: string;
  /** The ReactFlow node type key (e.g. "userNode_abc123") */
  nodeType: string;
  /** Display name in the palette */
  label: string;
  /** Short description */
  description: string;
  /** Emoji icon */
  emoji: string;
  /** Color accent (hex or tailwind-compatible) */
  color: string;
  /** Configurable fields that appear in the node / inspector */
  fields: UserNodeField[];
  /** Number of input handles */
  inputs: number;
  /** Number of output handles */
  outputs: number;
  /** When this definition was created */
  createdAt: string;
  /** When last updated */
  updatedAt: string;
};

// ── Storage ──────────────────────────────────────────────────────
//
// NOTE: Module-level storage key pattern. This is consistent with
// flow-templates.ts, use-workspaces.ts, and credential-store.ts.
// The key is set once per WorkflowBuilder mount via setUserNodeStoragePrefix().
// Limitation: only one storage prefix per page — multiple WorkflowBuilder
// instances with different prefixes on the same page will conflict.

let STORAGE_KEY = "athena:user-nodes";

/** Set the localStorage key prefix. Call once per WorkflowBuilder instance mount. */
export function setUserNodeStoragePrefix(prefix: string) {
  STORAGE_KEY = `${prefix}:user-nodes`;
}

export function getUserNodes(): UserNodeDefinition[] {
  try {
    const raw = syncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserNode(def: UserNodeDefinition): void {
  const all = getUserNodes();
  const idx = all.findIndex((n) => n.id === def.id);
  if (idx >= 0) {
    all[idx] = { ...def, updatedAt: new Date().toISOString() };
  } else {
    all.push(def);
  }
  syncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteUserNode(id: string): void {
  const all = getUserNodes().filter((n) => n.id !== id);
  syncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getUserNodeById(id: string): UserNodeDefinition | undefined {
  return getUserNodes().find((n) => n.id === id);
}

// ── Factory ──────────────────────────────────────────────────────

/** Create a new UserNodeDefinition with sensible defaults */
export function createUserNodeDefinition(
  partial: Partial<UserNodeDefinition> & Pick<UserNodeDefinition, "label">
): UserNodeDefinition {
  const id = uid("unode");
  const nodeType = `userNode_${id}`;
  return {
    id,
    nodeType,
    label: partial.label,
    description: partial.description ?? "",
    emoji: partial.emoji ?? "🔧",
    color: partial.color ?? "#818cf8",
    fields: partial.fields ?? [
      {
        key: "label",
        label: "Label",
        type: "text",
        defaultValue: partial.label,
      },
    ],
    inputs: partial.inputs ?? 1,
    outputs: partial.outputs ?? 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Build the default data object for a user node instance based on its definition */
export function buildUserNodeDefaults(
  def: UserNodeDefinition
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    _userNodeId: def.id,
    label: def.label,
  };
  for (const field of def.fields) {
    data[field.key] = field.defaultValue;
  }
  return data;
}
