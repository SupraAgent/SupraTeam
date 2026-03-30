/**
 * Client-side error reporter.
 *
 * Captures errors and sends them to /api/errors for persistent storage.
 * Deduplicates by fingerprint to avoid flooding the log with repeated errors.
 * Batches reports with a short debounce to reduce network calls.
 */

// ── Types ───────────────────────────────────────────────────

interface ErrorReport {
  severity: "error" | "warning" | "fatal";
  source: "client" | "server" | "api";
  message: string;
  stack?: string;
  component?: string;
  action?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

// ── Fingerprinting & dedup ──────────────────────────────────

const recentFingerprints = new Set<string>();
const DEDUP_WINDOW_MS = 60_000; // Don't report same error within 1 minute

function fingerprint(report: ErrorReport): string {
  // Use message + first stack line + component as the fingerprint
  const stackLine = report.stack?.split("\n")[1]?.trim() ?? "";
  return `${report.message}|${report.component ?? ""}|${stackLine}`;
}

// ── Batching ────────────────────────────────────────────────

let batch: (ErrorReport & { fingerprint: string })[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY_MS = 2_000;
const MAX_BATCH_SIZE = 10;

function scheduleBatchFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushBatch();
  }, BATCH_DELAY_MS);
}

async function flushBatch(): Promise<void> {
  if (batch.length === 0) return;
  const toSend = batch.splice(0, MAX_BATCH_SIZE);

  try {
    await fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errors: toSend }),
    });
  } catch {
    // Reporting itself failed — don't recurse, just drop
    // This is intentionally silent to avoid error loops
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Report an error to the error log.
 *
 * Safe to call from anywhere — deduplicates, batches, and fails silently.
 */
export function reportError(
  error: Error | string,
  context?: {
    component?: string;
    action?: string;
    severity?: "error" | "warning" | "fatal";
    source?: "client" | "server" | "api";
    metadata?: Record<string, unknown>;
  }
): void {
  const message = typeof error === "string" ? error : error.message;
  const stack = typeof error === "string" ? undefined : error.stack;

  const report: ErrorReport = {
    severity: context?.severity ?? "error",
    source: context?.source ?? "client",
    message: message.slice(0, 2000), // Cap message length
    stack: stack?.slice(0, 5000),    // Cap stack length
    component: context?.component,
    action: context?.action,
    url: typeof window !== "undefined" ? window.location.pathname : undefined,
    metadata: context?.metadata,
  };

  const fp = fingerprint(report);

  // Dedup: skip if we reported this same error recently
  if (recentFingerprints.has(fp)) return;
  recentFingerprints.add(fp);
  setTimeout(() => recentFingerprints.delete(fp), DEDUP_WINDOW_MS);

  batch.push({ ...report, fingerprint: fp });

  if (batch.length >= MAX_BATCH_SIZE) {
    flushBatch();
  } else {
    scheduleBatchFlush();
  }
}

/**
 * Wrap a fetch call with automatic error reporting on failure.
 *
 * Usage:
 *   const res = await reportedFetch("/api/email/send", { method: "POST", ... }, "email.send");
 */
export async function reportedFetch(
  url: string,
  init?: RequestInit,
  action?: string
): Promise<Response> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      // Try to extract error message from JSON response
      const body = await res.clone().json().catch(() => null);
      const errorMsg = body?.error ?? `HTTP ${res.status} ${res.statusText}`;
      reportError(errorMsg, {
        action,
        source: "api",
        severity: res.status >= 500 ? "error" : "warning",
        metadata: { status: res.status, url },
      });
    }
    return res;
  } catch (err) {
    reportError(err instanceof Error ? err : new Error(String(err)), {
      action,
      source: "api",
      severity: "error",
      metadata: { url },
    });
    throw err;
  }
}

// ── Global error handlers (install once) ────────────────────

let installed = false;

/**
 * Install global window error handlers. Call once in your app root.
 * Captures unhandled errors and unhandled promise rejections.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, {
      severity: "fatal",
      source: "client",
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
    reportError(error, {
      severity: "error",
      source: "client",
      action: "unhandled_promise_rejection",
    });
  });
}
