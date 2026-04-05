import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a duration between two ISO timestamps as a human-readable string. */
export function formatDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

/** Strip PostgREST filter metacharacters from a user-supplied value. */
export function sanitizePostgrestValue(val: string): string {
  return val.replace(/[,.()"\\]/g, "");
}

/** Escape a CSV cell value: RFC 4180 double-quote escaping + formula injection prevention. */
export function escapeCSV(val: string): string {
  let escaped = val.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(escaped)) {
    escaped = "'" + escaped;
  }
  return `"${escaped}"`;
}

/** Relative time string from an ISO timestamp. */
export function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (isNaN(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export type DealDenomination = "USD" | "USDT" | "SUPRA";

export function formatDealValue(
  value: number | null | undefined,
  denomination: DealDenomination = "USD",
  supraPrice?: number,
): string {
  if (value == null || value === 0) return "--";
  const v = Number(value);
  if (denomination === "SUPRA" && supraPrice && supraPrice > 0) {
    const tokens = v / supraPrice;
    return tokens >= 1000
      ? `${(tokens / 1000).toFixed(1)}K SUPRA`
      : `${Math.round(tokens).toLocaleString()} SUPRA`;
  }
  const prefix = denomination === "USDT" ? "" : "$";
  const suffix = denomination === "USDT" ? " USDT" : "";
  if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M${suffix}`;
  if (v >= 1_000) return `${prefix}${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K${suffix}`;
  return `${prefix}${v.toLocaleString()}${suffix}`;
}
