"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { Target, ExternalLink, LinkIcon, RotateCcw } from "lucide-react";
import { useThreadContext } from "@/lib/plugins/thread-context";

interface SpotlightEntry {
  threadId: string;
  dealId: string;
  dealName: string;
  boardType: string;
  value: number | null;
  stageName: string;
  stageColor: string;
  stagePosition: number;
  contactName: string | null;
  contactEmail: string | null;
  autoLinked: boolean;
  lastActivity: string | null;
}

export function DealSpotlightPanel() {
  const { selectThread } = useThreadContext();
  const [entries, setEntries] = React.useState<SpotlightEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    fetch("/api/plugins/deal-spotlight")
      .then((r) => r.json())
      .then((json) => setEntries(json.data?.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-3 w-3 rounded-full bg-white/5 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <Target className="h-8 w-8 opacity-20" />
        <p className="text-xs">No email threads linked to active deals</p>
        <p className="text-[10px] opacity-60">Threads auto-link when sender matches a CRM contact</p>
      </div>
    );
  }

  // Group by stage (sorted by position)
  const byStage = new Map<string, { color: string; position: number; items: SpotlightEntry[] }>();
  for (const entry of entries) {
    const key = entry.stageName;
    if (!byStage.has(key)) {
      byStage.set(key, { color: entry.stageColor, position: entry.stagePosition, items: [] });
    }
    byStage.get(key)!.items.push(entry);
  }

  const sortedStages = Array.from(byStage.entries()).sort(
    ([, a], [, b]) => a.position - b.position
  );

  return (
    <div className="space-y-4">
      {sortedStages.map(([stageName, stage]) => (
        <div key={stageName}>
          {/* Stage header */}
          <div className="flex items-center gap-2 mb-2">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stageName}
            </span>
            <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {stage.items.length}
            </span>
          </div>

          {/* Deal entries */}
          <div className="space-y-1">
            {stage.items.map((entry) => (
              <div
                key={`${entry.threadId}-${entry.dealId}`}
                className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5 transition group"
              >
                {/* Stage color bar */}
                <div
                  className="w-0.5 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/pipeline?deal=${entry.dealId}`}
                      className="text-xs font-medium text-foreground truncate hover:text-primary transition-colors"
                    >
                      {entry.dealName}
                    </Link>
                    <span className="text-[10px] text-muted-foreground shrink-0 rounded bg-white/5 px-1 py-0.5">
                      {entry.boardType}
                    </span>
                    {entry.value !== null && (
                      <span className="text-[10px] text-primary font-medium shrink-0">
                        ${(entry.value / 1000).toFixed(0)}k
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    {entry.contactName && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {entry.contactName}
                      </span>
                    )}
                    {entry.autoLinked && (
                      <span className="flex items-center gap-0.5 text-[10px] text-primary/60">
                        <LinkIcon className="h-2 w-2" />
                        auto
                      </span>
                    )}
                    {entry.lastActivity && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {timeAgo(entry.lastActivity)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button
                    onClick={() => selectThread(entry.threadId)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                    title="Open thread"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Refresh */}
      <button
        onClick={fetchData}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition w-full justify-center py-1"
      >
        <RotateCcw className="h-3 w-3" />
        Refresh
      </button>
    </div>
  );
}
