"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import {
  GitBranch, Mail, MessageCircle, Radio, UserPlus, Workflow,
  RotateCcw, Activity,
} from "lucide-react";

interface ActivityEvent {
  id: string;
  type: "stage_change" | "deal_created" | "tg_message" | "broadcast" | "member_event" | "workflow_run";
  title: string;
  description: string;
  timestamp: string;
  link?: string;
  meta?: Record<string, unknown>;
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  stage_change: { icon: GitBranch, color: "text-purple-400" },
  deal_created: { icon: UserPlus, color: "text-green-400" },
  tg_message: { icon: MessageCircle, color: "text-blue-400" },
  broadcast: { icon: Radio, color: "text-yellow-400" },
  member_event: { icon: UserPlus, color: "text-pink-400" },
  workflow_run: { icon: Workflow, color: "text-cyan-400" },
};

export function ActivityFeedPanel() {
  const [events, setEvents] = React.useState<ActivityEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const fetchActivity = React.useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/dashboard/activity?limit=15")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((json) => setEvents(json.data ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchActivity();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchActivity, 60_000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  if (loading && events.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-white/5 animate-pulse shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <Activity className="h-8 w-8 opacity-20" />
        <p className="text-xs text-red-400/80">Failed to load activity</p>
        <button onClick={fetchActivity} className="text-[10px] text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <Activity className="h-8 w-8 opacity-20" />
        <p className="text-xs">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {events.map((event) => {
        const config = EVENT_CONFIG[event.type] ?? { icon: Activity, color: "text-muted-foreground" };
        const Icon = config.icon;

        const content = (
          <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.02] transition group">
            <div className={cn("mt-0.5 shrink-0", config.color)}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-snug">
                {event.title}
              </p>
              {event.description && (
                <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {event.description}
                </p>
              )}
              <span className="text-[9px] text-muted-foreground/60">
                {timeAgo(event.timestamp)}
              </span>
            </div>
          </div>
        );

        if (event.link) {
          return (
            <Link key={event.id} href={event.link} className="block">
              {content}
            </Link>
          );
        }

        return <div key={event.id}>{content}</div>;
      })}

      {/* Refresh */}
      <button
        onClick={fetchActivity}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition w-full justify-center py-1.5"
      >
        <RotateCcw className="h-3 w-3" />
        Refresh
      </button>
    </div>
  );
}
