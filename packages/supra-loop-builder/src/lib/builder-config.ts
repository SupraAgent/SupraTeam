// ── Builder Configuration ────────────────────────────────────────
//
// Single entry point for all configurable defaults. Forkers change this
// file (or call `configureBuilder()` at runtime) instead of hunting
// through dozens of files for hardcoded strings.
//
// All storage modules read from `getBuilderConfig()` dynamically, so
// changing the config here is sufficient — no propagation needed.

// ── Config shape ─────────────────────────────────────────────────

export type BuilderConfig = {
  /** Prefix for all localStorage / IndexedDB keys (default: "builder") */
  storagePrefix: string;
  /** IndexedDB database name (default: "builder-storage") */
  idbName: string;
  /** Prefix for console.warn / console.error messages (default: "@builder") */
  logPrefix: string;
  /** Prefix for GitHub commit messages from output nodes (default: "Workflow") */
  commitMessagePrefix: string;
};

// ── Defaults ─────────────────────────────────────────────────────

const defaults: BuilderConfig = {
  storagePrefix: "builder",
  idbName: "builder-storage",
  logPrefix: "@builder",
  commitMessagePrefix: "Workflow",
};

let current: BuilderConfig = { ...defaults };

// ── Accessors ────────────────────────────────────────────────────

/** Read the current builder configuration (readonly copy). */
export function getBuilderConfig(): Readonly<BuilderConfig> {
  return current;
}

/**
 * Configure the builder in one call. Accepts a partial config —
 * only the keys you provide will be overridden.
 *
 * All storage modules read from `getBuilderConfig()` dynamically,
 * so this single call is all you need.
 *
 * @example
 * ```ts
 * import { configureBuilder } from "your-builder-package";
 *
 * configureBuilder({
 *   storagePrefix: "myapp",
 *   idbName: "myapp-storage",
 *   logPrefix: "@myapp/builder",
 *   commitMessagePrefix: "MyApp",
 * });
 * ```
 */
export function configureBuilder(overrides: Partial<BuilderConfig>): void {
  current = { ...current, ...overrides };
}

/**
 * Reset configuration to defaults. Useful for tests.
 */
export function resetBuilderConfig(): void {
  current = { ...defaults };
}
