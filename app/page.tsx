"use client";

import * as React from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MessageCircle, GitBranch, ExternalLink, UserPlus, AtSign, ArrowRight, Bell } from "lucide-react";

type Stats = {
  totalDeals: number;
  totalContacts: number;
  byBoard: { BD: number; Marketing: number; Admin: number };
  stageBreakdown: { id: string; name: string; position: number; count: number }[];
  recentDeals: { id: string; deal_name: string; board_type: string; stage_name: string; value: number | null; updated_at: string }[];
};

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  tg_deep_link: string | null;
  pipeline_link: string | null;
  is_read: boolean;
  created_at: string;
  deal: { id: string; deal_name: string; board_type: string; stage: { name: string; color: string } | null } | null;
};

const NOTIF_ICONS: Record<string, React.ElementType> = {
  tg_message: MessageCircle,
  stage_change: GitBranch,
  deal_created: ExternalLink,
  deal_assigned: UserPlus,
  mention: AtSign,
};

const NOTIF_COLORS: Record<string, string> = {
  tg_message: "text-blue-400",
  stage_change: "text-purple-400",
  deal_created: "text-green-400",
  deal_assigned: "text-yellow-400",
  mention: "text-pink-400",
};

export default function HomePage() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/stats").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/notifications?limit=15").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([statsData, notifData]) => {
        if (statsData) setStats(statsData);
        if (notifData) setNotifications(notifData.notifications ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const s = stats ?? { totalDeals: 0, totalContacts: 0, byBoard: { BD: 0, Marketing: 0, Admin: 0 }, stageBreakdown: [], recentDeals: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your CRM pipeline, contacts, and deal activity.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Open Deals" value={s.totalDeals} sub="Across all boards" />
        <StatCard label="Contacts" value={s.totalContacts} sub="Total in database" />
        <StatCard
          label="By Board"
          value=""
          sub={`BD: ${s.byBoard.BD} | Mktg: ${s.byBoard.Marketing} | Admin: ${s.byBoard.Admin}`}
        />
      </div>

      {/* Pipeline funnel */}
      {s.stageBreakdown.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-sm font-medium text-foreground mb-3">Pipeline Funnel</h2>
          <div className="space-y-2">
            {s.stageBreakdown.map((stage) => {
              const maxCount = Math.max(...s.stageBreakdown.map((st) => st.count), 1);
              const pct = (stage.count / maxCount) * 100;
              return (
                <div key={stage.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-36 truncate">{stage.name}</span>
                  <div className="flex-1 h-5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/40 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground w-6 text-right">{stage.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent deals */}
      {s.recentDeals.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h2 className="text-sm font-medium text-foreground">Recent Deals</h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {s.recentDeals.map((deal) => (
                <tr key={deal.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3">
                    <Link href="/pipeline" className="text-foreground font-medium hover:text-primary transition-colors">
                      {deal.deal_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      deal.board_type === "BD" && "bg-blue-500/20 text-blue-400",
                      deal.board_type === "Marketing" && "bg-purple-500/20 text-purple-400",
                      deal.board_type === "Admin" && "bg-orange-500/20 text-orange-400",
                    )}>
                      {deal.board_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{deal.stage_name}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{timeAgo(deal.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No deals yet.{" "}
            <Link href="/pipeline" className="text-primary hover:underline">
              Create your first deal
            </Link>{" "}
            to see activity here.
          </p>
        </div>
      )}

      {/* Activity feed */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium text-foreground">Activity Feed</h2>
          <span className="text-xs text-muted-foreground">
            {notifications.filter((n) => !n.is_read).length} unread
          </span>
        </div>

        {notifications.length > 0 ? (
          <div className="divide-y divide-white/5">
            {notifications.map((notif) => {
              const Icon = NOTIF_ICONS[notif.type] ?? Bell;
              const iconColor = NOTIF_COLORS[notif.type] ?? "text-muted-foreground";

              return (
                <div
                  key={notif.id}
                  className={cn(
                    "flex gap-3 px-5 py-3 transition-colors",
                    !notif.is_read && "bg-white/[0.02]"
                  )}
                >
                  <div className={cn("mt-0.5 shrink-0", iconColor)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-sm",
                        notif.is_read ? "text-muted-foreground" : "text-foreground"
                      )}>
                        {notif.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground/50">
                        {timeAgo(notif.created_at)}
                      </span>
                    </div>
                    {notif.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{notif.body}</p>
                    )}
                    {notif.deal && (
                      <div className="mt-1 flex items-center gap-1.5">
                        {notif.deal.stage && (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${notif.deal.stage.color}20`,
                              color: notif.deal.stage.color,
                            }}
                          >
                            {notif.deal.stage.name}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{notif.deal.deal_name}</span>
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      {notif.tg_deep_link && (
                        <a
                          href={notif.tg_deep_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300"
                        >
                          <MessageCircle className="h-3 w-3" />
                          Open in Telegram
                        </a>
                      )}
                      {notif.pipeline_link && (
                        <Link
                          href={notif.pipeline_link}
                          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80"
                        >
                          <ArrowRight className="h-3 w-3" />
                          View in Pipeline
                        </Link>
                      )}
                    </div>
                  </div>
                  {!notif.is_read && (
                    <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/20" />
            <p className="mt-2 text-sm text-muted-foreground">No activity yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Messages from Telegram groups linked to deals will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      {value !== "" && <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>}
      <p className="mt-0.5 text-xs text-muted-foreground/60">{sub}</p>
    </div>
  );
}
