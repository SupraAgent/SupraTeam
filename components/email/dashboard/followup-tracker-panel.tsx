"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { Clock, Mail, AlertTriangle, CheckCircle, RotateCcw } from "lucide-react";

interface FollowupItem {
  id: string;
  threadId: string | null;
  subject: string | null;
  scheduledFor: string;
  status: string;
  reminderType: string | null;
  ageDays: number;
  ageGroup: "today" | "1-3d" | "3-7d" | "7d+";
  contactName: string | null;
  contactEmail: string | null;
  dealName: string | null;
  dealId: string | null;
  stageName: string | null;
  stageColor: string | null;
}

interface FollowupTrackerPanelProps {
  onSelectThread?: (threadId: string) => void;
}

const AGE_GROUPS = [
  { key: "today", label: "Today", color: "text-green-400" },
  { key: "1-3d", label: "1-3 days", color: "text-yellow-400" },
  { key: "3-7d", label: "3-7 days", color: "text-orange-400" },
  { key: "7d+", label: "7+ days", color: "text-red-400" },
] as const;

export function FollowupTrackerPanel({ onSelectThread }: FollowupTrackerPanelProps) {
  const [followups, setFollowups] = React.useState<FollowupItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchFollowups = React.useCallback(() => {
    setLoading(true);
    fetch("/api/plugins/followups")
      .then((r) => r.json())
      .then((json) => setFollowups(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  async function handleDismiss(id: string) {
    const prev = followups;
    setFollowups((f) => f.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/email/scheduled?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setFollowups(prev);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white/5 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (followups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <CheckCircle className="h-8 w-8 opacity-20" />
        <p className="text-xs">All caught up — no pending follow-ups</p>
      </div>
    );
  }

  // Group by age
  const grouped = AGE_GROUPS.map((group) => ({
    ...group,
    items: followups.filter((f) => f.ageGroup === group.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", group.color)}>
              {group.label}
            </span>
            <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {group.items.length}
            </span>
          </div>

          <div className="space-y-1">
            {group.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5 transition group"
              >
                {/* Stage color dot */}
                {item.stageColor ? (
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.stageColor }}
                  />
                ) : (
                  <Clock className={cn("h-3 w-3 shrink-0", group.color)} />
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.threadId ? (
                      <button
                        onClick={() => onSelectThread?.(item.threadId!)}
                        className="text-xs text-foreground truncate hover:text-primary transition-colors text-left"
                      >
                        {item.subject || "No subject"}
                      </button>
                    ) : (
                      <span className="text-xs text-foreground truncate">
                        {item.subject || "No subject"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.contactName && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {item.contactName}
                      </span>
                    )}
                    {item.dealName && (
                      <Link
                        href={`/pipeline?deal=${item.dealId}`}
                        className="text-[10px] text-primary/70 hover:text-primary truncate transition-colors"
                      >
                        {item.dealName}
                      </Link>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {timeAgo(item.scheduledFor)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  {item.threadId && (
                    <button
                      onClick={() => onSelectThread?.(item.threadId!)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                      title="Open thread"
                    >
                      <Mail className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDismiss(item.id)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                    title="Dismiss"
                  >
                    <CheckCircle className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Refresh button */}
      <button
        onClick={fetchFollowups}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition w-full justify-center py-1"
      >
        <RotateCcw className="h-3 w-3" />
        Refresh
      </button>
    </div>
  );
}
