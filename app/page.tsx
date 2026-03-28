"use client";

import * as React from "react";
import Link from "next/link";
import { timeAgo, cn } from "@/lib/utils";
import {
  MessageCircle, GitBranch, ExternalLink, UserPlus, AtSign, ArrowRight, Bell,
  AlertTriangle, Clock, TrendingUp, Flame, Zap, DollarSign, BarChart3, Pin, Plus, Download, Users,
} from "lucide-react";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { ActionableNotificationWidget } from "@/components/notifications/actionable-notification-widget";

type Stats = {
  totalDeals: number;
  totalContacts: number;
  byBoard: { BD: number; Marketing: number; Admin: number };
  stageBreakdown: { id: string; name: string; position: number; color: string; count: number }[];
  recentDeals: { id: string; deal_name: string; board_type: string; stage_name: string; value: number | null; updated_at: string }[];
  totalPipelineValue: number;
  weightedPipelineValue: number;
  valueByBoard: { BD: number; Marketing: number; Admin: number };
  staleDeals: { id: string; deal_name: string; board_type: string; value: number | null; days_stale: number; stage_name: string }[];
  followUps: { id: string; deal_name: string; board_type: string; value: number | null; contact_name: string | null; hours_since: number }[];
  velocity: { movesThisWeek: number; movesLastWeek: number; avgDaysPerStage: { id: string; name: string; color: string; avg_days: number | null }[] };
  conversionRates: { id: string; name: string; color: string; next_stage: string; rate: number | null; total_moves: number }[];
  hotConversations: { name: string; count: number; deal_name: string; deal_id: string }[];
  pinnedDeals: { id: string; deal_name: string; board_type: string; value: number | null; stage_name: string; stage_color: string | null }[];
  onboarding: { hasBotToken: boolean; hasGroups: boolean; hasDeals: boolean; hasContacts: boolean; hasEmail: boolean };
};

type Analytics = {
  winRate: number | null;
  winRateByBoard: Record<string, number | null>;
  wonRevenue: number;
  lostRevenue: number;
  pipelineValue: number;
  weightedPipeline: number;
  monthlyForecast: Record<string, number>;
  lostReasons: { reason: string; count: number }[];
  healthDistribution: { critical: number; warning: number; healthy: number; excellent: number };
  avgDaysToClose: number | null;
  totalWon: number;
  totalLost: number;
  totalOpen: number;
};

type TeamStat = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  deal_count: number;
  total_value: number;
};

type Notification = {
  id: string; type: string; title: string; body: string | null;
  tg_deep_link: string | null; pipeline_link: string | null; is_read: boolean; created_at: string;
  deal: { id: string; deal_name: string; board_type: string; stage: { name: string; color: string } | null } | null;
};

const NOTIF_ICONS: Record<string, React.ElementType> = {
  tg_message: MessageCircle, stage_change: GitBranch, deal_created: ExternalLink, deal_assigned: UserPlus, mention: AtSign,
};
const NOTIF_COLORS: Record<string, string> = {
  tg_message: "text-blue-400", stage_change: "text-purple-400", deal_created: "text-green-400", deal_assigned: "text-yellow-400", mention: "text-pink-400",
};

export default function HomePage() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [analytics, setAnalytics] = React.useState<Analytics | null>(null);
  const [teamStats, setTeamStats] = React.useState<TeamStat[]>([]);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [reminders, setReminders] = React.useState<{ id: string; deal_id: string; reminder_type: string; message: string; due_at: string; deal?: { deal_name: string; board_type: string } }[]>([]);
  const [highlights, setHighlights] = React.useState<{ id: string; deal_id: string | null; sender_name: string | null; message_preview: string | null; tg_deep_link: string | null; highlight_type: string; created_at: string; triage_category?: string | null; triage_urgency?: string | null; triage_summary?: string | null; triaged_at?: string | null }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [triaging, setTriaging] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/stats").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/notifications?limit=10").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reminders").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/analytics").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/stats/team").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/highlights").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([statsData, notifData, reminderData, analyticsData, teamData, highlightsData]) => {
        if (statsData) setStats(statsData);
        if (notifData) setNotifications(notifData.notifications ?? []);
        if (reminderData) setReminders(reminderData.reminders ?? []);
        if (analyticsData) setAnalytics(analyticsData);
        if (teamData) setTeamStats(teamData.team ?? []);
        if (highlightsData) setHighlights(highlightsData.highlights ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/[0.02] animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-48 rounded-2xl bg-white/[0.02] animate-pulse" />)}
        </div>
      </div>
    );
  }

  const s = stats ?? {
    totalDeals: 0, totalContacts: 0, byBoard: { BD: 0, Marketing: 0, Admin: 0 },
    stageBreakdown: [], recentDeals: [], totalPipelineValue: 0, weightedPipelineValue: 0,
    valueByBoard: { BD: 0, Marketing: 0, Admin: 0 }, staleDeals: [], followUps: [],
    velocity: { movesThisWeek: 0, movesLastWeek: 0, avgDaysPerStage: [] },
    conversionRates: [], hotConversations: [], pinnedDeals: [],
    onboarding: { hasBotToken: false, hasGroups: false, hasDeals: false, hasContacts: false, hasEmail: false },
  };

  const velocityDelta = s.velocity.movesLastWeek > 0
    ? Math.round(((s.velocity.movesThisWeek - s.velocity.movesLastWeek) / s.velocity.movesLastWeek) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Command center for your CRM pipeline.</p>
        </div>
      </div>

      {/* Onboarding checklist (hidden when all complete) */}
      <SetupChecklist
        hasBotToken={s.onboarding.hasBotToken}
        hasGroups={s.onboarding.hasGroups}
        hasDeals={s.onboarding.hasDeals}
        hasContacts={s.onboarding.hasContacts}
        hasEmail={s.onboarding.hasEmail}
      />

      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/pipeline" className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-foreground transition hover:bg-white/[0.06]">
          <Plus className="h-3.5 w-3.5 text-primary" /> New Deal
        </Link>
        <Link href="/contacts" className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-foreground transition hover:bg-white/[0.06]">
          <Users className="h-3.5 w-3.5 text-blue-400" /> New Contact
        </Link>
        <a href="/api/deals/export" className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-foreground transition hover:bg-white/[0.06]">
          <Download className="h-3.5 w-3.5 text-purple-400" /> Export Deals
        </a>
        <a href="/api/contacts/export" className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-foreground transition hover:bg-white/[0.06]">
          <Download className="h-3.5 w-3.5 text-orange-400" /> Export Contacts
        </a>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Zap} iconColor="text-primary" label="Open Deals" value={s.totalDeals} sub={`BD: ${s.byBoard.BD} | Mktg: ${s.byBoard.Marketing} | Admin: ${s.byBoard.Admin}`} />
        <StatCard icon={Users} iconColor="text-blue-400" label="Contacts" value={s.totalContacts} sub="Total in database" />
        <StatCard icon={DollarSign} iconColor="text-green-400" label="Pipeline Value" value={`$${Math.round(s.totalPipelineValue).toLocaleString()}`} sub={`Weighted: $${Math.round(s.weightedPipelineValue).toLocaleString()}`} />
        <StatCard icon={TrendingUp} iconColor="text-purple-400" label="Moves This Week" value={s.velocity.movesThisWeek} sub={velocityDelta > 0 ? `+${velocityDelta}% vs last week` : velocityDelta < 0 ? `${velocityDelta}% vs last week` : "Same as last week"} />
      </div>

      {/* Analytics row */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{analytics.winRate !== null ? `${analytics.winRate}%` : "--"}</p>
            <p className="text-[10px] text-muted-foreground">Win Rate</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-green-400">${analytics.wonRevenue.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Won Revenue</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{analytics.avgDaysToClose !== null ? `${analytics.avgDaysToClose}d` : "--"}</p>
            <p className="text-[10px] text-muted-foreground">Avg Days to Close</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{analytics.totalWon}<span className="text-muted-foreground text-xs">/{analytics.totalWon + analytics.totalLost + analytics.totalOpen}</span></p>
            <p className="text-[10px] text-muted-foreground">Won / Total</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center col-span-2 md:col-span-1">
            <div className="flex justify-center gap-1.5">
              {(["critical", "warning", "healthy", "excellent"] as const).map((k) => {
                const colors = { critical: "bg-red-400", warning: "bg-yellow-400", healthy: "bg-green-400", excellent: "bg-emerald-400" };
                const v = analytics.healthDistribution[k];
                return v > 0 ? (
                  <span key={k} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", colors[k])} />{v}
                  </span>
                ) : null;
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Deal Health</p>
          </div>
        </div>
      )}

      {/* Revenue by board + Win rate by board */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["BD", "Marketing", "Admin"] as const).map((board) => {
            const boardColors = { BD: "blue", Marketing: "purple", Admin: "orange" };
            const c = boardColors[board];
            const wr = analytics.winRateByBoard[board];
            const bv = s.valueByBoard[board];
            return (
              <div key={board} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", `bg-${c}-500/20 text-${c}-400`)}>{board}</span>
                  {wr !== null && <span className="text-xs text-muted-foreground">{wr}% win rate</span>}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">${Math.round(bv).toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{s.byBoard[board]} deal{s.byBoard[board] !== 1 ? "s" : ""}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly forecast */}
      {analytics && Object.keys(analytics.monthlyForecast).length > 0 && (
        <Widget title="Monthly Forecast" icon={DollarSign} iconColor="text-green-400" subtitle="Weighted revenue by expected close">
          {Object.entries(analytics.monthlyForecast).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => {
            const maxVal = Math.max(...Object.values(analytics.monthlyForecast), 1);
            const pct = (value / maxVal) * 100;
            return (
              <div key={month} className="flex items-center gap-3 py-1.5">
                <span className="text-xs text-muted-foreground w-20">{month}</span>
                <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-green-500/30 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-medium text-foreground w-20 text-right">${Math.round(value).toLocaleString()}</span>
              </div>
            );
          })}
        </Widget>
      )}

      {/* Team leaderboard */}
      {teamStats.length > 0 && (
        <Widget title="Team Leaderboard" icon={Users} iconColor="text-blue-400" subtitle="Deals by assignee">
          {teamStats.slice(0, 8).map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 py-1.5">
              <span className="text-xs text-muted-foreground/50 w-4">{i + 1}</span>
              <div className="h-6 w-6 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground">{m.display_name?.charAt(0)?.toUpperCase() ?? "?"}</span>
                )}
              </div>
              <span className="text-xs text-foreground flex-1 truncate">{m.display_name}</span>
              <span className="text-[10px] text-muted-foreground">{m.deal_count} deal{m.deal_count !== 1 ? "s" : ""}</span>
              <span className="text-xs font-medium text-foreground w-20 text-right">${Math.round(m.total_value).toLocaleString()}</span>
            </div>
          ))}
        </Widget>
      )}

      {/* Lost reasons */}
      {analytics && analytics.lostReasons.length > 0 && (
        <Widget title="Lost Deal Reasons" icon={AlertTriangle} iconColor="text-red-400" subtitle={`${analytics.totalLost} lost deal${analytics.totalLost !== 1 ? "s" : ""}`}>
          {analytics.lostReasons.slice(0, 5).map((r) => (
            <div key={r.reason} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">{r.reason}</span>
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">{r.count}</span>
            </div>
          ))}
        </Widget>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Left column */}
        <div className="space-y-4">

          {/* Stale deals */}
          <Widget title="Stale Deals" icon={AlertTriangle} iconColor="text-red-400" subtitle="No activity in 7+ days" empty={s.staleDeals.length === 0} emptyText="No stale deals. Pipeline is healthy.">
            {s.staleDeals.map((d) => (
              <Link key={d.id} href={`/pipeline?highlight=${d.id}`} className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-white/[0.03] transition">
                <div>
                  <p className="text-sm text-foreground">{d.deal_name}</p>
                  <p className="text-[10px] text-muted-foreground">{d.stage_name} &middot; {d.days_stale}d stale</p>
                </div>
                <div className="text-right">
                  <BoardBadge type={d.board_type} />
                  {d.value != null && d.value > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">${Number(d.value).toLocaleString()}</p>}
                </div>
              </Link>
            ))}
          </Widget>

          {/* Follow-ups */}
          <Widget title="Follow-Ups Due" icon={Clock} iconColor="text-yellow-400" subtitle="Deals in Follow Up stage needing action" empty={s.followUps.length === 0} emptyText="No follow-ups pending.">
            {s.followUps.map((d) => (
              <Link key={d.id} href={`/pipeline?highlight=${d.id}`} className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-white/[0.03] transition">
                <div>
                  <p className="text-sm text-foreground">{d.deal_name}</p>
                  <p className="text-[10px] text-muted-foreground">{d.contact_name ?? "No contact"} &middot; {d.hours_since}h since last update</p>
                </div>
                <BoardBadge type={d.board_type} />
              </Link>
            ))}
          </Widget>

          {/* Reminders */}
          <Widget title="Reminders" icon={Bell} iconColor="text-amber-400" subtitle="Auto-generated deal reminders" empty={reminders.length === 0} emptyText="No active reminders. Configure them in Pipeline Settings.">
            {reminders.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-white/[0.03] transition">
                <Link href={`/pipeline?highlight=${r.deal_id}`} className="flex-1">
                  <p className="text-sm text-foreground">{r.deal?.deal_name ?? "Deal"}</p>
                  <p className="text-[10px] text-muted-foreground">{r.message}</p>
                </Link>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                    {r.reminder_type === "follow_up" ? "Follow up" : "Stage move?"}
                  </span>
                  <button
                    onClick={async () => {
                      await fetch("/api/reminders", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: r.id }),
                      });
                      setReminders((prev) => prev.filter((rem) => rem.id !== r.id));
                    }}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </Widget>

          {/* TG Highlights — messages needing attention with AI triage */}
          <Widget title="Needs Attention" icon={Zap} iconColor="text-amber-400" subtitle="Active TG highlights" empty={highlights.length === 0} emptyText="No active highlights.">
            {highlights.length > 0 && highlights.some((h) => !h.triaged_at) && (
              <button
                onClick={async () => {
                  setTriaging(true);
                  try {
                    const res = await fetch("/api/highlights/triage", { method: "POST" });
                    if (res.ok) {
                      const data = await res.json();
                      // Update highlights with triage data
                      const triagedMap = new Map(data.triaged?.map((t: { id: string; category: string; urgency: string; summary: string }) => [t.id, t]) ?? []);
                      setHighlights((prev) => prev.map((h) => {
                        const t = triagedMap.get(h.id) as { category: string; urgency: string; summary: string } | undefined;
                        return t ? { ...h, triage_category: t.category, triage_urgency: t.urgency, triage_summary: t.summary, triaged_at: new Date().toISOString() } : h;
                      }));
                    }
                  } finally {
                    setTriaging(false);
                  }
                }}
                disabled={triaging}
                className="w-full text-center py-1.5 text-[10px] text-primary hover:bg-primary/5 rounded-lg transition mb-1 disabled:opacity-50"
              >
                {triaging ? "Triaging..." : "Auto-triage with AI"}
              </button>
            )}
            {[...highlights]
              .sort((a, b) => {
                const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                const aU = a.triage_urgency ? (urgencyOrder[a.triage_urgency] ?? 4) : 4;
                const bU = b.triage_urgency ? (urgencyOrder[b.triage_urgency] ?? 4) : 4;
                return aU - bU;
              })
              .slice(0, 6).map((h) => {
              const urgencyColors: Record<string, string> = {
                critical: "bg-red-500/20 text-red-400",
                high: "bg-amber-500/20 text-amber-400",
                medium: "bg-blue-500/20 text-blue-400",
                low: "bg-white/10 text-muted-foreground",
              };
              return (
                <Link key={h.id} href={h.deal_id ? `/pipeline?highlight=${h.deal_id}` : "#"} className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-white/[0.03] transition">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-foreground truncate">{h.sender_name ?? "Unknown"}</p>
                        {h.triage_urgency && (
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-medium uppercase", urgencyColors[h.triage_urgency] ?? urgencyColors.medium)}>
                            {h.triage_urgency}
                          </span>
                        )}
                        {h.triage_category && (
                          <span className="rounded bg-white/5 px-1 py-0.5 text-[8px] text-muted-foreground">{h.triage_category}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{h.triage_summary ?? h.message_preview ?? "New message"}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{timeAgo(h.created_at)}</span>
                </Link>
              );
            })}
          </Widget>

          {/* Hot conversations */}
          <Widget title="Hot Conversations" icon={Flame} iconColor="text-orange-400" subtitle="Most active TG groups in last 24h" empty={s.hotConversations.length === 0} emptyText="No Telegram activity in the last 24h.">
            {s.hotConversations.map((c, i) => (
              <Link key={i} href={c.deal_id ? `/pipeline?highlight=${c.deal_id}` : "/groups"} className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-white/[0.03] transition">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
                  <div>
                    <p className="text-sm text-foreground">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.deal_name}</p>
                  </div>
                </div>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                  {c.count} msg{c.count !== 1 ? "s" : ""}
                </span>
              </Link>
            ))}
          </Widget>

          {/* Pinned deals */}
          {s.pinnedDeals.length > 0 && (
            <Widget title="Pinned Deals" icon={Pin} iconColor="text-primary" subtitle="High-priority deals (100% probability)">
              {s.pinnedDeals.map((d) => (
                <Link key={d.id} href={`/pipeline?highlight=${d.id}`} className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-white/[0.03] transition">
                  <div className="flex items-center gap-2">
                    {d.stage_color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.stage_color }} />}
                    <div>
                      <p className="text-sm text-foreground">{d.deal_name}</p>
                      <p className="text-[10px] text-muted-foreground">{d.stage_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <BoardBadge type={d.board_type} />
                    {d.value != null && d.value > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">${Number(d.value).toLocaleString()}</p>}
                  </div>
                </Link>
              ))}
            </Widget>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Pipeline funnel */}
          {s.stageBreakdown.length > 0 && (
            <Widget title="Pipeline Funnel" icon={BarChart3} iconColor="text-primary">
              {s.stageBreakdown.map((stage) => {
                const maxCount = Math.max(...s.stageBreakdown.map((st) => st.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div key={stage.id} className="flex items-center gap-3 py-1">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-xs text-muted-foreground w-32 truncate">{stage.name}</span>
                    <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: `${stage.color}60` }} />
                    </div>
                    <span className="text-xs font-medium text-foreground w-6 text-right">{stage.count}</span>
                  </div>
                );
              })}
            </Widget>
          )}

          {/* Stage conversion rates */}
          {s.conversionRates.length > 0 && (
            <Widget title="Conversion Rates" icon={TrendingUp} iconColor="text-green-400" subtitle="Stage-to-stage progression">
              {s.conversionRates.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-xs text-muted-foreground flex-1 truncate">{c.name} → {c.next_stage}</span>
                  {c.rate !== null ? (
                    <span className={cn("text-xs font-medium", c.rate >= 50 ? "text-green-400" : c.rate >= 25 ? "text-yellow-400" : "text-red-400")}>
                      {c.rate}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">--</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/50 w-12 text-right">{c.total_moves} moves</span>
                </div>
              ))}
            </Widget>
          )}

          {/* Avg days per stage */}
          {s.velocity.avgDaysPerStage.some((s) => s.avg_days !== null) && (
            <Widget title="Avg. Days per Stage" icon={Clock} iconColor="text-cyan-400" subtitle="This week's pipeline speed">
              {s.velocity.avgDaysPerStage.map((stage) => (
                <div key={stage.id} className="flex items-center gap-3 py-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-xs text-muted-foreground flex-1 truncate">{stage.name}</span>
                  <span className="text-xs font-medium text-foreground">
                    {stage.avg_days !== null ? `${stage.avg_days}d` : "--"}
                  </span>
                </div>
              ))}
            </Widget>
          )}

          {/* Actionable notifications */}
          <ActionableNotificationWidget />

        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({ icon: Icon, iconColor, label, value, sub }: { icon: React.ElementType; iconColor: string; label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", iconColor)} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground/60">{sub}</p>
    </div>
  );
}

function Widget({ title, icon: Icon, iconColor, subtitle, children, empty, emptyText }: {
  title: string; icon: React.ElementType; iconColor: string; subtitle?: string;
  children?: React.ReactNode; empty?: boolean; emptyText?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconColor)} />
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
        </div>
        {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="px-4 py-3">
        {empty ? (
          <p className="text-xs text-muted-foreground/50 text-center py-4">{emptyText}</p>
        ) : (
          <div className="space-y-0.5">{children}</div>
        )}
      </div>
    </div>
  );
}

function BoardBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
      type === "BD" && "bg-blue-500/20 text-blue-400",
      type === "Marketing" && "bg-purple-500/20 text-purple-400",
      type === "Admin" && "bg-orange-500/20 text-orange-400",
    )}>
      {type}
    </span>
  );
}
