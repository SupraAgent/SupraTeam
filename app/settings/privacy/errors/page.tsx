"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type ErrorEntry = {
  id: string;
  user_id: string;
  severity: "error" | "warning" | "fatal";
  source: "client" | "server" | "api";
  message: string;
  stack: string | null;
  component: string | null;
  action: string | null;
  url: string | null;
  user_agent: string | null;
  fingerprint: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const SEVERITY_COLORS: Record<string, string> = {
  fatal: "bg-red-500/20 text-red-400 border-red-500/30",
  error: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const SOURCE_COLORS: Record<string, string> = {
  client: "bg-blue-500/20 text-blue-400",
  server: "bg-purple-500/20 text-purple-400",
  api: "bg-cyan-500/20 text-cyan-400",
};

export default function ErrorLogPage() {
  const [entries, setEntries] = React.useState<ErrorEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [severityFilter, setSeverityFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const fetchEntries = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (severityFilter) params.set("severity", severityFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      const res = await fetch(`/api/errors?${params}`);
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data ?? []);
      }
    } catch {
      // Intentionally silent — we don't want error reporting to cause errors
    } finally {
      setLoading(false);
    }
  }, [severityFilter, sourceFilter]);

  React.useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Group by fingerprint for count display
  const fingerprintCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.fingerprint) {
        counts.set(e.fingerprint, (counts.get(e.fingerprint) ?? 0) + 1);
      }
    }
    return counts;
  }, [entries]);

  const stats = React.useMemo(() => {
    const fatal = entries.filter((e) => e.severity === "fatal").length;
    const error = entries.filter((e) => e.severity === "error").length;
    const warning = entries.filter((e) => e.severity === "warning").length;
    return { fatal, error, warning, total: entries.length };
  }, [entries]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Error Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Client-side and API errors captured from the app. Auto-cleaned after 30 days.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3">
        <div className="rounded-lg bg-card border border-border px-3 py-2 text-center min-w-[80px]">
          <p className="text-lg font-bold text-red-400">{stats.fatal}</p>
          <p className="text-[11px] text-muted-foreground">Fatal</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-3 py-2 text-center min-w-[80px]">
          <p className="text-lg font-bold text-orange-400">{stats.error}</p>
          <p className="text-[11px] text-muted-foreground">Errors</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-3 py-2 text-center min-w-[80px]">
          <p className="text-lg font-bold text-yellow-400">{stats.warning}</p>
          <p className="text-[11px] text-muted-foreground">Warnings</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-3 py-2 text-center min-w-[80px]">
          <p className="text-lg font-bold text-foreground">{stats.total}</p>
          <p className="text-[11px] text-muted-foreground">Total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All severities</option>
          <option value="fatal">Fatal</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All sources</option>
          <option value="client">Client</option>
          <option value="server">Server</option>
          <option value="api">API</option>
        </select>

        <Button
          onClick={fetchEntries}
          variant="secondary"
          size="sm"
          className="ml-auto"
        >
          Refresh
        </Button>
      </div>

      {/* Error list */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading errors...</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
          No errors recorded. That&apos;s a good thing.
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const isExpanded = expanded.has(entry.id);
            const count = entry.fingerprint ? fingerprintCounts.get(entry.fingerprint) ?? 1 : 1;

            return (
              <div
                key={entry.id}
                className="border border-border rounded-lg overflow-hidden"
              >
                {/* Row header */}
                <button
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
                >
                  {/* Severity badge */}
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[entry.severity] ?? ""}`}>
                    {entry.severity}
                  </span>

                  {/* Source badge */}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SOURCE_COLORS[entry.source] ?? ""}`}>
                    {entry.source}
                  </span>

                  {/* Message (truncated) */}
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">
                    {entry.message}
                  </span>

                  {/* Repeat count */}
                  {count > 1 && (
                    <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                      x{count}
                    </span>
                  )}

                  {/* Action context */}
                  {entry.action && (
                    <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0 hidden sm:block">
                      {entry.action}
                    </span>
                  )}

                  {/* Time */}
                  <span className="text-[11px] text-muted-foreground/50 shrink-0 w-16 text-right">
                    {timeAgo(entry.created_at)}
                  </span>

                  {/* Expand chevron */}
                  <svg
                    className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border bg-black/20 px-3 py-3 space-y-3">
                    {/* Context grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {entry.url && (
                        <>
                          <span className="text-muted-foreground">URL</span>
                          <span className="font-mono text-foreground">{entry.url}</span>
                        </>
                      )}
                      {entry.component && (
                        <>
                          <span className="text-muted-foreground">Component</span>
                          <span className="font-mono text-foreground">{entry.component}</span>
                        </>
                      )}
                      {entry.action && (
                        <>
                          <span className="text-muted-foreground">Action</span>
                          <span className="font-mono text-foreground">{entry.action}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">Time</span>
                      <span className="font-mono text-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                      {entry.fingerprint && (
                        <>
                          <span className="text-muted-foreground">Fingerprint</span>
                          <span className="font-mono text-foreground/60 truncate">
                            {entry.fingerprint.slice(0, 60)}...
                          </span>
                        </>
                      )}
                    </div>

                    {/* Stack trace */}
                    {entry.stack && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Stack trace</p>
                        <pre className="text-[11px] font-mono text-foreground/70 bg-black/30 rounded-lg p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                          {entry.stack}
                        </pre>
                      </div>
                    )}

                    {/* Metadata */}
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Metadata</p>
                        <pre className="text-[11px] font-mono text-foreground/70 bg-black/30 rounded-lg p-2 overflow-x-auto">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
