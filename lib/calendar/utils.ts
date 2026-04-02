/**
 * Google Calendar all-day events use exclusive end dates.
 * Subtract 1 day for display.
 */
export function toDisplayEndDate(exclusiveEndDate: string): string {
  const d = new Date(exclusiveEndDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

/**
 * Convert inclusive end date to Google's exclusive format for API calls.
 */
export function toExclusiveEndDate(inclusiveEndDate: string): string {
  const d = new Date(inclusiveEndDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}
