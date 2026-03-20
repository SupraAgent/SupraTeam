"use client";

import * as React from "react";
import Link from "next/link";
import { cn, timeAgo } from "@/lib/utils";
import {
  MessageCircle, GitBranch, ExternalLink, UserPlus, AtSign, Clock,
  ArrowRight, CheckCircle2, Timer, Bell,
} from "lucide-react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  tg_deep_link: string | null;
  pipeline_link: string | null;
  is_read: boolean;
  status?: string;
  grouped_count?: number;
  created_at: string;
  deal: {
    id: string;
    deal_name: string;
    board_type: string;
    stage: { name: string; color: string } | null;
  } | null;
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-blue-500",
  low: "border-l-white/10",
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  tg_message: MessageCircle,
  stage_change: GitBranch,
  deal_created: ExternalLink,
  deal_assigned: UserPlus,
  mention: AtSign,
  reminder: Clock,
};

const TYPE_COLORS: Record<string, string> = {
  tg_message: "text-blue-400",
  stage_change: "text-purple-400",
  deal_created: "text-green-400",
  deal_assigned: "text-yellow-400",
  mention: "text-pink-400",
  reminder: "text-amber-400",
};

type Props = {
  className?: string;
};

export function ActionableNotificationWidget({ className }: Props) {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread=true&limit=15");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function handleAction(id: string, action: "handled" | "dismiss" | "snooze", until?: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], action, until }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden", className)}>
        <div className="px-4 py-3 border-b border-white/10">
          <div className="h-4 w-32 rounded bg-white/5 animate-pulse" />
        </div>
        <div className="p-3 space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-white/[0.02] animate-pulse" />)}
        </div>
      </div>
    );
  }

  const active = notifications.filter((n) => n.status !== "snoozed" && n.status !== "dismissed" && n.status !== "handled");

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium text-foreground">Action Required</h2>
        </div>
        {active.length > 0 && (
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
            {active.length}
          </span>
        )}
      </div>

      <div className="max-h-[400px] overflow-y-auto thin-scroll">
        {active.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400/30" />
            <p className="mt-2 text-xs text-muted-foreground">All caught up!</p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {active.map((notif) => {
              const Icon = TYPE_ICONS[notif.type] ?? Bell;
              const iconColor = TYPE_COLORS[notif.type] ?? "text-muted-foreground";

              return (
                <div
                  key={notif.id}
                  className="rounded-xl border border-white/5 border-l-[3px] border-l-blue-500 bg-white/[0.02] p-3 transition hover:bg-white/[0.04]"
                >
                  {/* Header */}
                  <div className="flex items-start gap-2">
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", iconColor)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground leading-snug">{notif.title}</p>
                        <span className="text-[9px] text-muted-foreground/50 shrink-0">{timeAgo(notif.created_at)}</span>
                      </div>
                      {notif.body && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{notif.body}</p>
                      )}
                    </div>
                  </div>

                  {/* Deal badge + grouped count */}
                  <div className="mt-1.5 flex items-center gap-2">
                    {notif.deal && (
                      <>
                        {notif.deal.stage && (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: `${notif.deal.stage.color}20`, color: notif.deal.stage.color }}
                          >
                            {notif.deal.stage.name}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground truncate">{notif.deal.deal_name}</span>
                      </>
                    )}
                    {(notif.grouped_count ?? 1) > 1 && (
                      <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
                        +{(notif.grouped_count ?? 1) - 1} more
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {notif.pipeline_link && (
                      <Link
                        href={notif.pipeline_link}
                        className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition hover:bg-primary/20"
                      >
                        <ArrowRight className="h-3 w-3" />
                        Open Deal
                      </Link>
                    )}
                    {notif.tg_deep_link && (
                      <a
                        href={notif.tg_deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-400 transition hover:bg-blue-500/20"
                      >
                        <MessageCircle className="h-3 w-3" />
                        Reply in TG
                      </a>
                    )}
                    <button
                      onClick={() => handleAction(notif.id, "handled")}
                      className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 transition hover:bg-emerald-500/20"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Handled
                    </button>
                    <button
                      onClick={() => {
                        const fourHours = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
                        handleAction(notif.id, "snooze", fourHours);
                      }}
                      className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400 transition hover:bg-amber-500/20"
                    >
                      <Timer className="h-3 w-3" />
                      Snooze
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
