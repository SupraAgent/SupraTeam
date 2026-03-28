import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a unique ID with an optional prefix (uses crypto.randomUUID when available) */
export function uid(prefix = ""): string {
  const base =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}-${base}` : base;
}

/**
 * Strip API key patterns from error messages to prevent credential leaks.
 * Catches Anthropic (sk-ant-*), OpenAI (sk-*), and generic key=value patterns.
 */
export function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/sk-ant-[a-zA-Z0-9-]+/g, "sk-ant-***")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***")
    .replace(/key[=: ]["']?[a-zA-Z0-9-]{20,}["']?/gi, "key=***");
}

/** Deep clone that handles nested arrays/objects in node data */
export function deepCloneNodeData<T>(data: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback for non-cloneable values
    }
  }
  return JSON.parse(JSON.stringify(data));
}
