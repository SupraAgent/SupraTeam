"use client";

import * as React from "react";
import { Bell, Check, CheckCheck, ExternalLink, ArrowRight, MessageCircle, GitBranch, UserPlus, AtSign, Clock } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  tg_deep_link: string | null;
  tg_sender_name: string | null;
  pipeline_link: string | null;
  is_read: boolean;
  created_at: string;
  deal: {
    id: string;
    deal_name: string;
    board_type: string;
    stage: { name: string; color: string } | null;
  } | null;
  contact: {
    id: string;
    name: string;
    telegram_username: string | null;
  } | null;
  tg_group: {
    id: string;
    group_name: string;
    group_url: string | null;
  } | null;
};

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  tg_message: { icon: MessageCircle, label: "Telegram", color: "text-blue-400" },
  stage_change: { icon: GitBranch, label: "Stage Change", color: "text-purple-400" },
  deal_created: { icon: ExternalLink, label: "New Deal", color: "text-green-400" },
  deal_assigned: { icon: UserPlus, label: "Assigned", color: "text-yellow-400" },
  mention: { icon: AtSign, label: "Mention", color: "text-pink-400" },
  reminder: { icon: Clock, label: "Reminder", color: "text-amber-400" },
};

export function NotificationCenter() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unread_count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchNotifications();
    let interval = setInterval(fetchNotifications, 30000);

    function handleVisibility() {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        fetchNotifications();
        interval = setInterval(fetchNotifications, 30000);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchNotifications]);

  // Close on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-xl p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[hsl(225,35%,8%)] shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-medium text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[480px] overflow-y-auto thin-scroll">
            {loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/[0.02] animate-pulse" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Activity from Telegram groups linked to deals will appear here.
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {notifications.map((notif) => {
                  const config = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.tg_message;
                  const Icon = config.icon;

                  return (
                    <div
                      key={notif.id}
                      className={cn(
                        "group relative rounded-xl px-3 py-2.5 transition",
                        notif.is_read
                          ? "hover:bg-white/[0.03]"
                          : "bg-white/[0.04] hover:bg-white/[0.06]"
                      )}
                    >
                      {/* Unread dot */}
                      {!notif.is_read && (
                        <div className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}

                      <div className="flex gap-3">
                        <div className={cn("mt-0.5 shrink-0", config.color)}>
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn(
                              "text-sm leading-snug",
                              notif.is_read ? "text-muted-foreground" : "text-foreground"
                            )}>
                              {notif.title}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground/50">
                              {timeAgo(notif.created_at)}
                            </span>
                          </div>

                          {notif.body && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {notif.body}
                            </p>
                          )}

                          {/* Deal badge */}
                          {notif.deal && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              {notif.deal.stage && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: `${notif.deal.stage.color}20`,
                                    color: notif.deal.stage.color,
                                  }}
                                >
                                  {notif.deal.stage.name}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {notif.deal.deal_name}
                              </span>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                            {notif.tg_deep_link && (
                              <a
                                href={notif.tg_deep_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-400 transition hover:bg-blue-500/20"
                              >
                                <MessageCircle className="h-3 w-3" />
                                Open in Telegram
                              </a>
                            )}
                            {notif.pipeline_link && (
                              <a
                                href={notif.pipeline_link}
                                className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition hover:bg-primary/20"
                              >
                                <ArrowRight className="h-3 w-3" />
                                View in Pipeline
                              </a>
                            )}
                            {!notif.is_read && (
                              <button
                                onClick={() => markRead(notif.id)}
                                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                              >
                                <Check className="h-3 w-3" />
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
