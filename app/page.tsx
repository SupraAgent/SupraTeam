"use client";

import * as React from "react";
import Link from "next/link";
import { timeAgo, cn } from "@/lib/utils";
import {
  MessageCircle, GitBranch, ExternalLink, UserPlus, Bell,
  AlertTriangle, Clock, TrendingUp, Zap, DollarSign, BarChart3, Pin,
  ChevronDown, ChevronRight, Radio, Send, Activity, Shield, Workflow,
  Globe, ArrowRight, Video, Calendar, Users,
} from "lucide-react";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { LinkConversationWizard } from "@/components/onboarding/link-conversation-wizard";
import { ActionableNotificationWidget } from "@/components/notifications/actionable-notification-widget";
import { InlineActionCard } from "@/components/dashboard/inline-action-card";

const ACTIVITY_ICON_MAP: Record<string, { icon: React.ElementType; color: string }> = {
  stage_change: { icon: GitBranch, color: "text-purple-400" },
  deal_created: { icon: ExternalLink, color: "text-green-400" },
  broadcast: { icon: Send, color: "text-blue-400" },
  tg_message: { icon: MessageCircle, color: "text-blue-400" },
  member_event: { icon: UserPlus, color: "text-yellow-400" },
  workflow_run: { icon: Radio, color: "text-cyan-400" },
};
const ACTIVITY_ICON_FALLBACK = { icon: Zap, color: "text-muted-foreground" };

const HEALTH_COLORS: Record<string, string> = {
  critical: "bg-red-400", warning: "bg-yellow-400", healthy: "bg-green-400", excellent: "bg-emerald-400",
};

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
  crossSignals: { deal_name: string; deal_id: string; group_name: string; health: string; days_stale: number; stage_name: string }[];
  pinnedDeals: { id: string; deal_name: string; board_type: string; value: number | null; stage_name: string; stage_color: string | null }[];
  onboarding: { hasBotToken: boolean; hasGroups: boolean; hasDeals: boolean; hasContacts: boolean; hasEmail: boolean; hasLinkedChats: boolean };
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

interface NextCallEvent {
  id: string;
  summary: string;
  start_at: string | null;
  end_at: string | null;
  hangout_link: string | null;
  html_link: string | null;
  location: string | null;
  attendees: { email: string; displayName?: string }[];
  deal_id: string | null;
  deal_name: string | null;
}

interface DashboardExtras {
  responseTime: { avg_ms: number | null; median_ms: number | null; sample_count: number; daily_trend: { date: string; avg_ms: number }[] };
  groups: { id: string; name: string; member_count: number; messages_7d: number; health: string; bot_admin: boolean; last_active: string | null }[];
  groupHealthSummary: { total: number; active: number; quiet: number; stale: number; dead: number; total_members: number; total_messages_7d: number; bot_admin_count: number };
  workflowStats: { active_count: number; runs_7d: number; completed: number; failed: number; running: number };
  suggestions: { id: string; title: string; score: number | null; upvotes: number; status: string; category: string }[];
  nextCalls?: NextCallEvent[];
  hasCalendarConnection?: boolean;
}

interface ActivityEvent {
  id: string;
  type: "stage_change" | "deal_created" | "tg_message" | "broadcast" | "member_event" | "workflow_run";
  title: string;
  description: string;
  timestamp: string;
  link?: string;
  meta?: Record<string, unknown>;
}

type Highlight = {
  id: string; deal_id: string | null; sender_name: string | null; message_preview: string | null;
  tg_deep_link: string | null; highlight_type: string; created_at: string;
  triage_category?: string | null; triage_urgency?: string | null; triage_summary?: string | null; triaged_at?: string | null;
  chat_id?: string | null;
};

export default function HomePage() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [analytics, setAnalytics] = React.useState<Analytics | null>(null);
  const [reminders, setReminders] = React.useState<{ id: string; deal_id: string; reminder_type: string; message: string; due_at: string; deal?: { deal_name: string; board_type: string } }[]>([]);
  const [highlights, setHighlights] = React.useState<Highlight[]>([]);
  const [extras, setExtras] = React.useState<DashboardExtras | null>(null);
  const [activityFeed, setActivityFeed] = React.useState<ActivityEvent[]>([]);
  const [timeRange, setTimeRange] = React.useState<"7d" | "30d" | "90d" | "all">("30d");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showLinkWizard, setShowLinkWizard] = React.useState(false);

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("dashboard_collapsed");
      if (stored) setCollapsed(JSON.parse(stored));
    } catch { /* noop */ }
  }, []);

  const toggleCollapse = React.useCallback((key: string) => {
    setCollapsed((prev: Record<string, boolean>) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("dashboard_collapsed", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  React.useEffect(() => {
    setLoading(true);
    const rangeParam = timeRange !== "all" ? `?range=${timeRange}` : "";
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      fetch(`/api/stats${rangeParam}`, { signal }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reminders", { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/analytics${rangeParam}`, { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/highlights", { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/dashboard/extras`, { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/dashboard/activity?limit=30", { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([statsData, reminderData, analyticsData, highlightsData, extrasData, activityData]) => {
        if (signal.aborted) return;
        if (statsData) setStats(statsData);
        if (reminderData) setReminders(reminderData.reminders ?? []);
        if (analyticsData) setAnalytics(analyticsData);
        if (highlightsData) setHighlights(highlightsData.highlights ?? []);
        if (extrasData) setExtras(extrasData);
        if (activityData) setActivityFeed(activityData.events ?? []);
        setLastUpdated(new Date());
      })
      .catch(() => { /* aborted or network error */ })
      .finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [timeRange]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/dashboard/activity?limit=30")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            setActivityFeed(data.events ?? []);
            setLastUpdated(new Date());
          }
        })
        .catch(() => { /* silent refresh failure */ });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-10 rounded-xl bg-white/[0.02] animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/[0.02] animate-pulse" />)}
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
    conversionRates: [], hotConversations: [], crossSignals: [], pinnedDeals: [],
    onboarding: { hasBotToken: false, hasGroups: false, hasDeals: false, hasContacts: false, hasEmail: false, hasLinkedChats: false },
  };

  const velocityDelta = s.velocity.movesLastWeek > 0
    ? Math.round(((s.velocity.movesThisWeek - s.velocity.movesLastWeek) / s.velocity.movesLastWeek) * 100)
    : 0;

  const ghs = extras?.groupHealthSummary;
  const wfs = extras?.workflowStats;

  // Cross-signal alerts: deals with linked TG groups that went quiet (computed server-side via crm_deal_linked_chats)
  const crossSignals = s.crossSignals;

  // Count total closed deals for analytics gating
  const totalClosed = analytics ? analytics.totalWon + analytics.totalLost : 0;

  // Determine onboarding completion
  const onboardingSteps = [s.onboarding.hasBotToken, s.onboarding.hasGroups, s.onboarding.hasDeals, s.onboarding.hasContacts, s.onboarding.hasEmail, s.onboarding.hasLinkedChats];
  const onboardingDone = onboardingSteps.filter(Boolean).length;
  const allOnboardingDone = onboardingDone === onboardingSteps.length;

  // Show link conversation prompt when deals exist but no linked chats
  const showLinkConversationPrompt = s.onboarding.hasDeals && !s.onboarding.hasLinkedChats;

  // Groups needing attention (stale, dead, or quiet with low activity)
  const groupsNeedingAttention = (extras?.groups ?? [])
    .filter((g) => g.health === "stale" || g.health === "dead" || (g.health === "quiet" && g.messages_7d === 0))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your personal CRM overview.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-0.5">
            {(["7d", "30d", "90d", "all"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  timeRange === range ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {range === "all" ? "All" : range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Onboarding — auto-collapses at 4/5, hidden at 5/5 */}
      {!allOnboardingDone && (
        <SetupChecklist
          hasBotToken={s.onboarding.hasBotToken}
          hasGroups={s.onboarding.hasGroups}
          hasDeals={s.onboarding.hasDeals}
          hasContacts={s.onboarding.hasContacts}
          hasEmail={s.onboarding.hasEmail}
        />
      )}

      {/* ========== DO THESE NOW — Expandable Inline Action Cards ========== */}
      {(() => {
        type ActionItem = {
          key: string;
          actionType: "followup" | "tg_urgent" | "stale" | "reminders";
          icon: React.ElementType;
          color: string;
          label: string;
          detail: string;
          href: string;
          messagePreview: string | null;
          senderName: string | null;
          chatId: string | null;
        };
        const actions: ActionItem[] = [];

        // 1. Overdue follow-ups
        if (s.followUps.length > 0) {
          const worst = s.followUps[0];
          actions.push({
            key: "followup",
            actionType: "followup",
            icon: Clock,
            color: "text-yellow-400",
            label: `${s.followUps.length} follow-up${s.followUps.length !== 1 ? "s" : ""} overdue`,
            detail: worst.deal_name + (worst.hours_since > 24 ? ` (${Math.floor(worst.hours_since / 24)}d ago)` : ` (${Math.round(worst.hours_since)}h ago)`),
            href: "/pipeline",
            messagePreview: null,
            senderName: null,
            chatId: null,
          });
        }

        // 2. Critical/high TG messages needing reply
        const criticalHighlights = highlights.filter((h) => h.triage_urgency === "critical" || h.triage_urgency === "high");
        if (criticalHighlights.length > 0) {
          const first = criticalHighlights[0];
          actions.push({
            key: "tg_urgent",
            actionType: "tg_urgent",
            icon: MessageCircle,
            color: "text-red-400",
            label: `${criticalHighlights.length} urgent message${criticalHighlights.length !== 1 ? "s" : ""} awaiting reply`,
            detail: first.sender_name ? `From ${first.sender_name}` : "In Telegram",
            href: "/inbox",
            messagePreview: first.message_preview ?? null,
            senderName: first.sender_name ?? null,
            chatId: first.chat_id ?? null,
          });
        }

        // 3. Stale deals (no activity for days)
        if (s.staleDeals.length > 0) {
          const worst = s.staleDeals[0];
          actions.push({
            key: "stale",
            actionType: "stale",
            icon: AlertTriangle,
            color: "text-red-400",
            label: `${s.staleDeals.length} deal${s.staleDeals.length !== 1 ? "s" : ""} going cold`,
            detail: `${worst.deal_name} — ${worst.days_stale}d stale`,
            href: "/pipeline",
            messagePreview: null,
            senderName: null,
            chatId: null,
          });
        }

        // 4. Due reminders — compute once against a stable timestamp to avoid re-render flicker
        const now = Date.now();
        const dueReminders = reminders.filter((r) => new Date(r.due_at).getTime() <= now);
        if (dueReminders.length > 0 && actions.length < 3) {
          actions.push({
            key: "reminders",
            actionType: "reminders",
            icon: Bell,
            color: "text-amber-400",
            label: `${dueReminders.length} reminder${dueReminders.length !== 1 ? "s" : ""} due now`,
            detail: dueReminders[0].message,
            href: "/calendar",
            messagePreview: null,
            senderName: null,
            chatId: null,
          });
        }

        if (actions.length === 0) return null;

        return (
          <div className="rounded-xl border border-white/10 bg-gradient-to-r from-red-500/[0.04] to-amber-500/[0.04] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-foreground">Do These Now</h2>
            </div>
            <div className="space-y-2">
              {actions.slice(0, 3).map((action) => (
                <InlineActionCard
                  key={action.key}
                  actionType={action.actionType}
                  icon={action.icon}
                  iconColor={action.color}
                  label={action.label}
                  detail={action.detail}
                  href={action.href}
                  messagePreview={action.messagePreview}
                  senderName={action.senderName}
                  chatId={action.chatId}
                  onReply={() => {
                    // Optimistically remove the highlight that was replied to
                    if (action.actionType === "tg_urgent") {
                      setHighlights((prev) => prev.filter((h) => h.triage_urgency !== "critical" && h.triage_urgency !== "high"));
                    }
                  }}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* ========== NEXT 3 CALLS WIDGET ========== */}
      {(() => {
        const nextCalls = extras?.nextCalls ?? [];
        const hasCalConn = extras?.hasCalendarConnection ?? false;

        // No calendar connection — show connect prompt
        if (!hasCalConn) {
          return (
            <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">
                  Connect Google Calendar to see upcoming calls here.
                </p>
              </div>
              <Link
                href="/settings"
                className="text-xs text-primary hover:text-primary/80 transition shrink-0"
              >
                Connect
              </Link>
            </div>
          );
        }

        // Calendar connected but no upcoming calls
        if (nextCalls.length === 0) return null;

        return (
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Video className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-foreground">Next Calls</h2>
              <span className="text-[11px] text-muted-foreground">{nextCalls.length} upcoming</span>
            </div>
            <div className="space-y-2">
              {nextCalls.map((call) => {
                const startMs = call.start_at ? new Date(call.start_at).getTime() : null;
                const nowMs = Date.now();
                let relativeTime = "";
                if (startMs) {
                  const diffMin = Math.round((startMs - nowMs) / 60000);
                  if (diffMin <= 0) {
                    relativeTime = "now";
                  } else if (diffMin < 60) {
                    relativeTime = `in ${diffMin}m`;
                  } else if (diffMin < 1440) {
                    const hrs = Math.floor(diffMin / 60);
                    const mins = diffMin % 60;
                    relativeTime = mins > 0 ? `in ${hrs}h ${mins}m` : `in ${hrs}h`;
                  } else {
                    const days = Math.floor(diffMin / 1440);
                    relativeTime = `in ${days}d`;
                  }
                }

                const attendeeNames = (call.attendees ?? [])
                  .slice(0, 3)
                  .map((a) => a.displayName ?? a.email.split("@")[0]);
                const moreAttendees = (call.attendees ?? []).length > 3
                  ? (call.attendees ?? []).length - 3
                  : 0;

                return (
                  <div
                    key={call.id}
                    className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5"
                  >
                    {/* Relative time badge */}
                    <div className={cn(
                      "rounded-lg px-2 py-1 text-xs font-medium shrink-0 min-w-[56px] text-center",
                      relativeTime === "now"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-blue-500/10 text-blue-400",
                    )}>
                      {relativeTime || "--"}
                    </div>

                    {/* Call info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {call.summary}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {call.deal_name && (
                          <Link
                            href={`/pipeline?highlight=${call.deal_id}`}
                            className="text-xs text-primary hover:underline truncate"
                          >
                            {call.deal_name}
                          </Link>
                        )}
                        {attendeeNames.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                            <Users className="h-3 w-3 shrink-0" />
                            {attendeeNames.join(", ")}
                            {moreAttendees > 0 && ` +${moreAttendees}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Join button */}
                    {call.hangout_link ? (
                      <a
                        href={call.hangout_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 px-3 py-1.5 text-xs font-medium transition shrink-0"
                      >
                        Join
                      </a>
                    ) : call.html_link ? (
                      <a
                        href={call.html_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 px-3 py-1.5 text-xs font-medium transition shrink-0"
                      >
                        View
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ========== TELEGRAM PULSE STATUS BAR ========== */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Telegram Pulse</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          {(() => {
            const criticalCount = highlights.filter((h) => h.triage_urgency === "critical").length;
            const highCount = highlights.filter((h) => h.triage_urgency === "high").length;
            const urgentTotal = criticalCount + highCount;
            if (urgentTotal > 0) {
              return (
                <Link href="/inbox" className="flex items-center gap-1.5 hover:text-foreground transition">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  {criticalCount > 0 && <span className="font-medium text-red-400">{criticalCount} critical</span>}
                  {criticalCount > 0 && highCount > 0 && <span>,</span>}
                  {highCount > 0 && <span className="font-medium text-orange-400">{highCount} high</span>}
                  {highlights.length > urgentTotal && <span className="text-muted-foreground">+ {highlights.length - urgentTotal} more</span>}
                </Link>
              );
            }
            if (highlights.length > 0) {
              return (
                <Link href="/inbox" className="flex items-center gap-1.5 hover:text-foreground transition">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="font-medium text-amber-400">{highlights.length} unread</span>
                  <span>need{highlights.length === 1 ? "s" : ""} reply</span>
                </Link>
              );
            }
            return (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                All caught up
              </span>
            );
          })()}
          <span className="text-white/10">|</span>
          {s.staleDeals.length > 0 ? (
            <Link href="/pipeline" className="flex items-center gap-1.5 hover:text-foreground transition">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="font-medium text-red-400">{s.staleDeals.length} stale deal{s.staleDeals.length !== 1 ? "s" : ""}</span>
            </Link>
          ) : (
            <span>No stale deals</span>
          )}
          <span className="text-white/10">|</span>
          {s.followUps.length > 0 ? (
            <Link href="/pipeline" className="flex items-center gap-1.5 hover:text-foreground transition">
              <Clock className="h-3 w-3 text-yellow-400" />
              <span className="font-medium text-yellow-400">{s.followUps.length} follow-up{s.followUps.length !== 1 ? "s" : ""} due</span>
            </Link>
          ) : (
            <span>No follow-ups due</span>
          )}
          {ghs && ghs.total > 0 && (
            <>
              <span className="text-white/10">|</span>
              <Link href="/groups" className="flex items-center gap-1.5 hover:text-foreground transition">
                <Globe className="h-3 w-3 text-blue-400" />
                <span>{ghs.active} active</span>
                {(ghs.stale + ghs.dead) > 0 && (
                  <span className="font-medium text-red-400">{ghs.stale + ghs.dead} need attention</span>
                )}
                <span>of {ghs.total} groups</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ========== TELEGRAM INBOX PREVIEW ========== */}
      {highlights.length > 0 && (() => {
        const urgencyRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const sorted = [...highlights].sort((a, b) => {
          const aRank = urgencyRank[a.triage_urgency ?? "medium"] ?? 2;
          const bRank = urgencyRank[b.triage_urgency ?? "medium"] ?? 2;
          return bRank - aRank;
        });
        const criticalCount = highlights.filter((h) => h.triage_urgency === "critical").length;
        const highCount = highlights.filter((h) => h.triage_urgency === "high").length;
        const urgentSummary = [
          criticalCount > 0 ? `${criticalCount} critical` : "",
          highCount > 0 ? `${highCount} high` : "",
        ].filter(Boolean).join(", ");
        return (
        <Widget
          title={urgentSummary ? `Needs Attention — ${urgentSummary}` : "Needs Response"}
          icon={MessageCircle}
          iconColor={criticalCount > 0 ? "text-red-400" : "text-amber-400"}
          subtitle={`${highlights.length} conversation${highlights.length !== 1 ? "s" : ""} waiting`}
          collapsible
          isCollapsed={collapsed["inbox_preview"]}
          onToggle={() => toggleCollapse("inbox_preview")}
        >
          {sorted.slice(0, 5).map((h) => (
            <Link
              key={h.id}
              href={h.tg_deep_link ?? (h.deal_id ? `/pipeline?highlight=${h.deal_id}` : "/inbox")}
              className={cn(
                "flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition group",
                h.triage_urgency === "critical" && "border-l-2 border-l-red-500 bg-red-500/[0.04]",
                h.triage_urgency === "high" && "border-l-2 border-l-orange-500 bg-orange-500/[0.04]",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  h.triage_urgency === "critical" ? "bg-red-500/20" :
                  h.triage_urgency === "high" ? "bg-orange-500/20" : "bg-amber-500/20"
                )}>
                  <MessageCircle className={cn(
                    "h-3.5 w-3.5",
                    h.triage_urgency === "critical" ? "text-red-400" :
                    h.triage_urgency === "high" ? "text-orange-400" : "text-amber-400"
                  )} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-foreground truncate">{h.sender_name ?? "Unknown"}</p>
                    {h.triage_category && (
                      <span className={cn(
                        "rounded px-1 py-0 text-[9px] font-medium",
                        h.triage_urgency === "critical" ? "bg-red-500/20 text-red-400" :
                        h.triage_urgency === "high" ? "bg-orange-500/20 text-orange-400" :
                        "bg-white/10 text-muted-foreground"
                      )}>
                        {h.triage_category.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {h.triage_summary ? h.triage_summary.split(" | ")[0] : h.message_preview ?? "New message"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {h.triage_urgency && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    h.triage_urgency === "critical" && "bg-red-500/20 text-red-400",
                    h.triage_urgency === "high" && "bg-orange-500/20 text-orange-400",
                    h.triage_urgency === "medium" && "bg-yellow-500/20 text-yellow-400",
                    h.triage_urgency === "low" && "bg-white/10 text-muted-foreground",
                  )}>
                    {h.triage_urgency}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">{timeAgo(h.created_at)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
              </div>
            </Link>
          ))}
          {highlights.length > 5 && (
            <Link href="/inbox" className="block text-center text-xs text-primary hover:underline py-2">
              View all {highlights.length} conversations
            </Link>
          )}
        </Widget>
        );
      })()}

      {/* ========== HOT CONVERSATIONS (from stats) ========== */}
      {s.hotConversations.length > 0 && (
        <Widget
          title="Hot Conversations"
          icon={Zap}
          iconColor="text-orange-400"
          subtitle={`${s.hotConversations.length} active thread${s.hotConversations.length !== 1 ? "s" : ""}`}
          collapsible
          isCollapsed={collapsed["hot_convos"]}
          onToggle={() => toggleCollapse("hot_convos")}
        >
          {s.hotConversations.slice(0, 5).map((c) => (
            <Link
              key={c.deal_id}
              href={`/pipeline?highlight=${c.deal_id}`}
              className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                  <Zap className="h-3.5 w-3.5 text-orange-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.deal_name}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-orange-400 shrink-0 ml-2">{c.count} msgs</span>
            </Link>
          ))}
        </Widget>
      )}

      {/* ========== TOP STAT CARDS — blended TG + Pipeline ========== */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={MessageCircle}
          iconColor={highlights.length > 0 ? "text-amber-400" : "text-green-400"}
          label="Unread Conversations"
          value={highlights.length}
          sub={highlights.length > 0 ? "Need your reply" : "All caught up"}
        />
        <StatCard
          icon={Globe}
          iconColor="text-blue-400"
          label="Group Health"
          value={ghs ? `${ghs.active}/${ghs.total}` : "--"}
          sub={ghs && ghs.total > 0
            ? `${ghs.active} active · ${ghs.quiet} quiet · ${ghs.stale + ghs.dead} at risk`
            : s.onboarding.hasGroups ? "No group data yet" : "Add groups to track health"
          }
        />
        <StatCard icon={Zap} iconColor="text-primary" label="Open Deals" value={s.totalDeals} sub={`BD: ${s.byBoard.BD} | Mktg: ${s.byBoard.Marketing} | Admin: ${s.byBoard.Admin}`} />
        <StatCard icon={TrendingUp} iconColor="text-purple-400" label="Moves This Week" value={s.velocity.movesThisWeek} sub={velocityDelta > 0 ? `+${velocityDelta}% vs last week` : velocityDelta < 0 ? `${velocityDelta}% vs last week` : "Same as last week"} />
        <StatCard
          icon={Clock}
          iconColor={extras?.responseTime.avg_ms != null ? (extras.responseTime.avg_ms < 1800000 ? "text-green-400" : extras.responseTime.avg_ms < 7200000 ? "text-yellow-400" : "text-red-400") : "text-muted-foreground"}
          label="Avg Response"
          value={extras?.responseTime.avg_ms != null ? formatDuration(extras.responseTime.avg_ms) : "--"}
          sub={extras?.responseTime.sample_count ? `${extras.responseTime.sample_count} responses (30d)` : s.onboarding.hasBotToken ? "Reply to messages to track" : "Connect Telegram to track"}
          sparkline={extras?.responseTime.daily_trend.map((d) => d.avg_ms)}
        />
      </div>

      {/* ========== CROSS-SIGNAL ALERTS ========== */}
      {crossSignals.length > 0 && (
        <Widget
          title="Deal + Group Alerts"
          icon={AlertTriangle}
          iconColor="text-red-400"
          subtitle={`${crossSignals.length} deal${crossSignals.length !== 1 ? "s" : ""} with quiet groups`}
          collapsible
          isCollapsed={collapsed["cross_signals"]}
          onToggle={() => toggleCollapse("cross_signals")}
        >
          {crossSignals.map((cs) => (
            <Link
              key={cs.deal_id}
              href={`/pipeline?highlight=${cs.deal_id}`}
              className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{cs.deal_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {cs.stage_name} · {cs.days_stale}d stale — group <span className="text-red-400">&quot;{cs.group_name}&quot;</span> is {cs.health}
                </p>
              </div>
              <HealthBadge health={cs.health} />
            </Link>
          ))}
        </Widget>
      )}

      {/* ========== ACTION REQUIRED ========== */}
      {(s.staleDeals.length > 0 || s.followUps.length > 0 || reminders.length > 0 || groupsNeedingAttention.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-400">Action Required</h2>
            <span className="text-xs text-muted-foreground">
              {s.staleDeals.length + s.followUps.length + reminders.length + groupsNeedingAttention.length} items
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Stale deals */}
            <Widget title="Stale Deals" icon={AlertTriangle} iconColor="text-red-400" subtitle={`${s.staleDeals.length} deal${s.staleDeals.length !== 1 ? "s" : ""}`} empty={s.staleDeals.length === 0} emptyText="No stale deals." collapsible isCollapsed={collapsed["stale"]} onToggle={() => toggleCollapse("stale")}>
              {s.staleDeals.map((d) => (
                <Link key={d.id} href={`/pipeline?highlight=${d.id}`} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition">
                  <div>
                    <p className="text-sm text-foreground">{d.deal_name}</p>
                    <p className="text-xs text-muted-foreground">{d.stage_name} &middot; {d.days_stale}d stale</p>
                  </div>
                  <div className="text-right">
                    <BoardBadge type={d.board_type} />
                    {d.value != null && d.value > 0 && <p className="text-xs text-muted-foreground mt-0.5">${Number(d.value).toLocaleString()}</p>}
                  </div>
                </Link>
              ))}
            </Widget>

            {/* Follow-ups */}
            <Widget title="Follow-Ups Due" icon={Clock} iconColor="text-yellow-400" subtitle={`${s.followUps.length} pending`} empty={s.followUps.length === 0} emptyText="No follow-ups pending." collapsible isCollapsed={collapsed["followups"]} onToggle={() => toggleCollapse("followups")}>
              {s.followUps.map((d) => (
                <Link key={d.id} href={`/pipeline?highlight=${d.id}`} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition">
                  <div>
                    <p className="text-sm text-foreground">{d.deal_name}</p>
                    <p className="text-xs text-muted-foreground">{d.contact_name ?? "No contact"} &middot; {d.hours_since}h ago</p>
                  </div>
                  <BoardBadge type={d.board_type} />
                </Link>
              ))}
            </Widget>

            {/* Groups Needing Attention */}
            {groupsNeedingAttention.length > 0 && (
              <Widget
                title="Groups Needing Attention"
                icon={Globe}
                iconColor="text-red-400"
                subtitle={`${groupsNeedingAttention.length} group${groupsNeedingAttention.length !== 1 ? "s" : ""}`}
                collapsible
                isCollapsed={collapsed["groups_attention"]}
                onToggle={() => toggleCollapse("groups_attention")}
              >
                {groupsNeedingAttention.map((g) => (
                  <Link key={g.id} href="/groups" className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.member_count} members · {g.messages_7d} msgs/7d
                        {g.last_active && ` · last active ${timeAgo(g.last_active)}`}
                      </p>
                    </div>
                    <HealthBadge health={g.health} />
                  </Link>
                ))}
                {(extras?.groups ?? []).filter((g) => g.health === "stale" || g.health === "dead").length > 5 && (
                  <Link href="/groups" className="block text-center text-xs text-primary hover:underline py-2">
                    View all groups
                  </Link>
                )}
              </Widget>
            )}

            {/* Reminders */}
            {reminders.length > 0 && (
              <Widget title="Reminders" icon={Bell} iconColor="text-amber-400" subtitle={`${reminders.length} active`} collapsible isCollapsed={collapsed["reminders"]} onToggle={() => toggleCollapse("reminders")}>
                {reminders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition">
                    <Link href={`/pipeline?highlight=${r.deal_id}`} className="flex-1">
                      <p className="text-sm text-foreground">{r.deal?.deal_name ?? "Deal"}</p>
                      <p className="text-xs text-muted-foreground">{r.message}</p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                        {r.reminder_type === "follow_up" ? "Follow up" : "Stage move?"}
                      </span>
                      <button
                        onClick={async () => {
                          const prev = reminders;
                          setReminders((cur) => cur.filter((rem) => rem.id !== r.id));
                          try {
                            const res = await fetch("/api/reminders", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: r.id }),
                            });
                            if (!res.ok) setReminders(prev);
                          } catch {
                            setReminders(prev);
                          }
                        }}
                        className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded-lg hover:bg-white/[0.05] transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </Widget>
            )}
          </div>
        </div>
      )}

      {/* ========== GROUP HEALTH + AUTOMATION STATUS ========== */}
      {((ghs && ghs.total > 0) || (wfs && wfs.active_count > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Group Health Distribution */}
          {ghs && ghs.total > 0 && (
            <Widget
              title="Group Health"
              icon={Globe}
              iconColor="text-blue-400"
              subtitle={`${ghs.total} groups · ${ghs.total_members.toLocaleString()} members · ${ghs.total_messages_7d.toLocaleString()} msgs/7d`}
              collapsible
              isCollapsed={collapsed["group_health"]}
              onToggle={() => toggleCollapse("group_health")}
            >
              <div className="space-y-3">
                {/* Health bar */}
                <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
                  {ghs.active > 0 && <div className="bg-green-500" style={{ width: `${(ghs.active / ghs.total) * 100}%` }} title={`Active: ${ghs.active}`} />}
                  {ghs.quiet > 0 && <div className="bg-yellow-500" style={{ width: `${(ghs.quiet / ghs.total) * 100}%` }} title={`Quiet: ${ghs.quiet}`} />}
                  {ghs.stale > 0 && <div className="bg-orange-500" style={{ width: `${(ghs.stale / ghs.total) * 100}%` }} title={`Stale: ${ghs.stale}`} />}
                  {ghs.dead > 0 && <div className="bg-red-500" style={{ width: `${(ghs.dead / ghs.total) * 100}%` }} title={`Dead: ${ghs.dead}`} />}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 flex-wrap">
                  <HealthLegendItem color="bg-green-500" label="Active" count={ghs.active} />
                  <HealthLegendItem color="bg-yellow-500" label="Quiet" count={ghs.quiet} />
                  <HealthLegendItem color="bg-orange-500" label="Stale" count={ghs.stale} />
                  <HealthLegendItem color="bg-red-500" label="Dead" count={ghs.dead} />
                </div>
                {/* Bot admin coverage */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <span>Bot admin in {ghs.bot_admin_count}/{ghs.total} groups</span>
                </div>
              </div>
            </Widget>
          )}

          {/* Workflow / Automation Status */}
          {wfs && wfs.active_count > 0 && (
            <Widget
              title="Automations"
              icon={Workflow}
              iconColor="text-cyan-400"
              subtitle={`${wfs.active_count} active workflow${wfs.active_count !== 1 ? "s" : ""}`}
              collapsible
              isCollapsed={collapsed["automations"]}
              onToggle={() => toggleCollapse("automations")}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="text-lg font-semibold text-foreground">{wfs.runs_7d}</p>
                    <p className="text-[11px] text-muted-foreground">Runs (7d)</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="text-lg font-semibold text-green-400">{wfs.completed}</p>
                    <p className="text-[11px] text-muted-foreground">Completed</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className={cn("text-lg font-semibold", wfs.failed > 0 ? "text-red-400" : "text-foreground")}>{wfs.failed}</p>
                    <p className="text-[11px] text-muted-foreground">Failed</p>
                  </div>
                </div>
                {wfs.running > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-cyan-400 font-medium">{wfs.running} running now</span>
                  </div>
                )}
                {wfs.failed > 0 && wfs.runs_7d > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Success rate: {Math.round(((wfs.completed) / wfs.runs_7d) * 100)}%</span>
                  </div>
                )}
                <Link href="/automations" className="block text-center text-xs text-primary hover:underline py-1">
                  Manage automations
                </Link>
              </div>
            </Widget>
          )}
        </div>
      )}

      {/* ========== ANALYTICS — gated behind minimum data ========== */}
      {analytics && totalClosed >= 5 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{analytics.winRate !== null ? `${analytics.winRate}%` : "--"}</p>
            <p className="text-[11px] text-muted-foreground">Win Rate</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-green-400">${analytics.wonRevenue.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">Won Revenue</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{analytics.avgDaysToClose !== null ? `${analytics.avgDaysToClose}d` : "--"}</p>
            <p className="text-[11px] text-muted-foreground">Avg Days to Close</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{analytics.totalWon}<span className="text-muted-foreground text-xs">/{analytics.totalWon + analytics.totalLost + analytics.totalOpen}</span></p>
            <p className="text-[11px] text-muted-foreground">Won / Total</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center col-span-2 md:col-span-1">
            <div className="flex justify-center gap-1.5">
              {(["critical", "warning", "healthy", "excellent"] as const).map((k) => {
                const v = analytics.healthDistribution[k];
                return v > 0 ? (
                  <span key={k} className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_COLORS[k])} />{v}
                  </span>
                ) : null;
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Deal Health</p>
          </div>
        </div>
      )}

      {/* Analytics nudge when not enough data */}
      {analytics && totalClosed < 5 && totalClosed > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            Close {5 - totalClosed} more deal{5 - totalClosed !== 1 ? "s" : ""} to unlock win rate, revenue, and velocity analytics.
            <span className="text-foreground/60 ml-1">{totalClosed}/5 closed so far.</span>
          </p>
        </div>
      )}

      {/* Monthly forecast — only if has data */}
      {analytics && Object.keys(analytics.monthlyForecast).length > 0 && totalClosed >= 5 && (
        <Widget title="Monthly Forecast" icon={DollarSign} iconColor="text-green-400" subtitle="Weighted revenue by expected close" collapsible isCollapsed={collapsed["forecast"]} onToggle={() => toggleCollapse("forecast")}>
          {(() => { const maxVal = Math.max(...Object.values(analytics.monthlyForecast), 1); return Object.entries(analytics.monthlyForecast).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => {
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
          }); })()}
        </Widget>
      )}

      {/* Lost reasons — only if has data */}
      {analytics && analytics.lostReasons.length > 0 && totalClosed >= 5 && (
        <Widget title="Lost Deal Reasons" icon={AlertTriangle} iconColor="text-red-400" subtitle={`${analytics.totalLost} lost deal${analytics.totalLost !== 1 ? "s" : ""}`} collapsible isCollapsed={collapsed["lost"]} onToggle={() => toggleCollapse("lost")}>
          {analytics.lostReasons.slice(0, 5).map((r) => (
            <div key={r.reason} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">{r.reason}</span>
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-400">{r.count}</span>
            </div>
          ))}
        </Widget>
      )}

      {/* ========== TWO-COLUMN LAYOUT ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Left column */}
        <div className="space-y-4">

          {/* Live Activity Feed */}
          <Widget title="Activity Feed" icon={Zap} iconColor="text-primary" subtitle="Last 48h" empty={activityFeed.length === 0} emptyText="No recent activity." collapsible isCollapsed={collapsed["activity"]} onToggle={() => toggleCollapse("activity")}>
            {activityFeed.slice(0, 12).map((evt: ActivityEvent) => {
              const { icon: EvtIcon, color } = ACTIVITY_ICON_MAP[evt.type] ?? ACTIVITY_ICON_FALLBACK;
              const isFailed = evt.meta?.status === "failed";
              return (
                <div key={evt.id} className="flex items-start gap-2 py-1.5">
                  <EvtIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", isFailed ? "text-red-400" : color)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    {evt.link ? (
                      <Link href={evt.link} className="text-xs text-foreground hover:underline truncate block">{evt.title}</Link>
                    ) : (
                      <p className="text-xs text-foreground truncate">{evt.title}</p>
                    )}
                    <p className={cn("text-[11px] truncate", isFailed ? "text-red-400" : "text-muted-foreground")}>{evt.description}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70 shrink-0">{timeAgo(evt.timestamp)}</span>
                </div>
              );
            })}
          </Widget>

          {/* Pinned deals */}
          {s.pinnedDeals.length > 0 && (
            <Widget title="Pinned Deals" icon={Pin} iconColor="text-primary" subtitle="High-priority deals (100% probability)" collapsible isCollapsed={collapsed["pinned"]} onToggle={() => toggleCollapse("pinned")}>
              {s.pinnedDeals.map((d) => (
                <Link key={d.id} href={`/pipeline?highlight=${d.id}`} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.03] transition">
                  <div className="flex items-center gap-2">
                    {d.stage_color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.stage_color }} />}
                    <div>
                      <p className="text-sm text-foreground">{d.deal_name}</p>
                      <p className="text-[11px] text-muted-foreground">{d.stage_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <BoardBadge type={d.board_type} />
                    {d.value != null && d.value > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">${Number(d.value).toLocaleString()}</p>}
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
            <Widget title="Pipeline Funnel" icon={BarChart3} iconColor="text-primary" collapsible isCollapsed={collapsed["funnel"]} onToggle={() => toggleCollapse("funnel")}>
              {(() => { const maxCount = Math.max(...s.stageBreakdown.map((st) => st.count), 1); return s.stageBreakdown.map((stage) => {
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
              }); })()}
            </Widget>
          )}

          {/* Stage conversion rates */}
          {s.conversionRates.length > 0 && (
            <Widget title="Conversion Rates" icon={TrendingUp} iconColor="text-green-400" subtitle="Stage-to-stage progression" collapsible isCollapsed={collapsed["conversion"]} onToggle={() => toggleCollapse("conversion")}>
              {s.conversionRates.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-xs text-muted-foreground flex-1 truncate">{c.name} → {c.next_stage}</span>
                  {c.rate !== null ? (
                    <span className={cn("text-xs font-medium", c.rate >= 50 ? "text-green-400" : c.rate >= 25 ? "text-yellow-400" : "text-red-400")}>
                      {c.rate}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">--</span>
                  )}
                  <span className="text-[11px] text-muted-foreground/70 w-12 text-right">{c.total_moves} moves</span>
                </div>
              ))}
            </Widget>
          )}

          {/* Avg days per stage */}
          {s.velocity.avgDaysPerStage.some((stage) => stage.avg_days !== null) && (
            <Widget title="Avg. Days per Stage" icon={Clock} iconColor="text-cyan-400" subtitle="This week's pipeline speed" collapsible isCollapsed={collapsed["avgdays"]} onToggle={() => toggleCollapse("avgdays")}>
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

// --- Helpers ---

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

// --- Sub-components ---

function Sparkline({ data, color = "text-primary" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className={cn("opacity-70", color)} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="7-day trend sparkline">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function StatCard({ icon: Icon, iconColor, label, value, sub, sparkline }: { icon: React.ElementType; iconColor: string; label: string; value: string | number; sub: string; sparkline?: number[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconColor)} />
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        {sparkline && sparkline.length >= 2 && <Sparkline data={sparkline} color={iconColor} />}
      </div>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground/60">{sub}</p>
    </div>
  );
}

function Widget({ title, icon: Icon, iconColor, subtitle, children, empty, emptyText, collapsible, isCollapsed, onToggle }: {
  title: string; icon: React.ElementType; iconColor: string; subtitle?: string;
  children?: React.ReactNode; empty?: boolean; emptyText?: string;
  collapsible?: boolean; isCollapsed?: boolean; onToggle?: () => void;
}) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
      <button
        type="button"
        onClick={collapsible ? onToggle : undefined}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 border-b border-white/10 text-left",
          collapsible && "cursor-pointer hover:bg-white/[0.02] transition",
          isCollapsed && "border-b-0",
        )}
      >
        <div className="flex items-center gap-2">
          {collapsible && <Chevron className="h-3.5 w-3.5 text-muted-foreground" />}
          <Icon className={cn("h-4 w-4", iconColor)} />
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
        </div>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </button>
      {!isCollapsed && (
        <div className="px-4 py-3">
          {empty ? (
            <p className="text-xs text-muted-foreground/70 text-center py-4">{emptyText}</p>
          ) : (
            <div className="space-y-0.5">{children}</div>
          )}
        </div>
      )}
    </div>
  );
}

function BoardBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
      type === "BD" && "bg-blue-500/20 text-blue-400",
      type === "Marketing" && "bg-purple-500/20 text-purple-400",
      type === "Admin" && "bg-orange-500/20 text-orange-400",
    )}>
      {type}
    </span>
  );
}

function HealthBadge({ health }: { health: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    quiet: "bg-yellow-500/20 text-yellow-400",
    stale: "bg-orange-500/20 text-orange-400",
    dead: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", styles[health] ?? "bg-white/10 text-muted-foreground")}>
      {health}
    </span>
  );
}

function HealthLegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span>{label}</span>
      <span className="font-medium text-foreground">{count}</span>
    </div>
  );
}
