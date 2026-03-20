"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Bell,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type NotificationLog = {
  id: string;
  notification_type: string;
  deal_id: string | null;
  tg_chat_id: number;
  message_preview: string | null;
  status: string;
  tg_message_id: number | null;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  deal: { deal_name: string } | null;
};

type Stats = {
  sent_24h: number;
  failed_24h: number;
  dead_letter_24h: number;
};

type Preferences = {
  muted_types: string[];
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_tz: string;
  digest_frequency: string;
  digest_day: string | null;
  digest_hour: number;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  sent: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Sent" },
  failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Failed" },
  dead_letter: { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", label: "Dead Letter" },
  pending: { icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Pending" },
};

const TYPE_LABELS: Record<string, string> = {
  stage_change: "Stage Change",
  daily_digest: "Daily Digest",
  broadcast: "Broadcast",
  automation: "Automation",
  scheduled: "Scheduled",
};

const NOTIFICATION_TYPES = [
  { key: "tg_message", label: "Telegram Messages", description: "Direct messages from the bot" },
  { key: "stage_change", label: "Stage Changes", description: "When a deal moves to a new stage" },
  { key: "deal_created", label: "Deal Created", description: "When a new deal is created" },
  { key: "deal_assigned", label: "Deal Assigned", description: "When a deal is assigned to you" },
  { key: "mention", label: "Mentions", description: "When you are mentioned in a note or comment" },
  { key: "reminder", label: "Reminders", description: "Scheduled follow-up reminders" },
] as const;

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Taipei", label: "Asia/Taipei" },
  { value: "US/Pacific", label: "US/Pacific" },
  { value: "US/Eastern", label: "US/Eastern" },
  { value: "Europe/London", label: "Europe/London" },
] as const;

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const DIGEST_OPTIONS = [
  { value: "realtime", label: "Realtime", description: "Receive notifications immediately" },
  { value: "daily", label: "Daily", description: "One digest per day" },
  { value: "weekly", label: "Weekly", description: "One digest per week" },
  { value: "off", label: "Off", description: "No digest notifications" },
] as const;

const DEFAULT_PREFS: Preferences = {
  muted_types: [],
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_tz: "UTC",
  digest_frequency: "realtime",
  digest_day: null,
  digest_hour: 9,
};

/* ------------------------------------------------------------------ */
/*  Preferences Tab                                                    */
/* ------------------------------------------------------------------ */

function PreferencesTab() {
  const [prefs, setPrefs] = React.useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/notification-preferences");
        if (res.ok) {
          const data = await res.json();
          setPrefs({ ...DEFAULT_PREFS, ...data.preferences });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save preferences");
        return;
      }
      toast.success("Preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const toggleMuted = (type: string) => {
    setPrefs((p) => ({
      ...p,
      muted_types: p.muted_types.includes(type)
        ? p.muted_types.filter((t) => t !== type)
        : [...p.muted_types, type],
    }));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
        <div className="h-32 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Type Toggles */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
        <h3 className="text-sm font-medium text-foreground">Notification Types</h3>
        <p className="mt-1 text-xs text-muted-foreground">Choose which notifications you want to receive.</p>
        <div className="mt-4 space-y-3">
          {NOTIFICATION_TYPES.map(({ key, label, description }) => {
            const enabled = !prefs.muted_types.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleMuted(key)}
                className="w-full flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] transition-colors text-left"
              >
                <div>
                  <p className="text-sm text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    enabled ? "bg-emerald-500" : "bg-white/10"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                      enabled ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Quiet Hours</h3>
            <p className="mt-1 text-xs text-muted-foreground">Suppress notifications during specific hours.</p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs((p) => ({ ...p, quiet_hours_enabled: !p.quiet_hours_enabled }))}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              prefs.quiet_hours_enabled ? "bg-emerald-500" : "bg-white/10"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                prefs.quiet_hours_enabled ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        {prefs.quiet_hours_enabled && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Start</label>
              <input
                type="time"
                value={prefs.quiet_hours_start ?? "22:00"}
                onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_start: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">End</label>
              <input
                type="time"
                value={prefs.quiet_hours_end ?? "08:00"}
                onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_end: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Timezone</label>
              <select
                value={prefs.quiet_hours_tz}
                onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_tz: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm text-foreground"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Digest Frequency */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
        <h3 className="text-sm font-medium text-foreground">Digest Frequency</h3>
        <p className="mt-1 text-xs text-muted-foreground">How often you want to receive notification digests.</p>
        <div className="mt-4 space-y-2">
          {DIGEST_OPTIONS.map(({ value, label, description }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, digest_frequency: value }))}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                prefs.digest_frequency === value
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
              )}
            >
              <div
                className={cn(
                  "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  prefs.digest_frequency === value ? "border-emerald-500" : "border-white/20"
                )}
              >
                {prefs.digest_frequency === value && (
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                )}
              </div>
              <div>
                <p className="text-sm text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </button>
          ))}
        </div>

        {prefs.digest_frequency === "weekly" && (
          <div className="mt-4">
            <label className="block text-xs text-muted-foreground mb-2">Day of week</label>
            <div className="flex gap-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, digest_day: day }))}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    prefs.digest_day === day
                      ? "bg-emerald-500 text-white"
                      : "border border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Delivery Log Tab (existing)                                        */
/* ------------------------------------------------------------------ */

function DeliveryLogTab() {
  const [logs, setLogs] = React.useState<NotificationLog[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const fetchLogs = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      params.set("limit", "100");

      const res = await fetch(`/api/notification-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setStats(data.stats ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  React.useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" variant="ghost" onClick={() => { setLoading(true); fetchLogs(); }}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3 text-center">
            <p className="text-lg font-semibold text-emerald-400">{stats.sent_24h}</p>
            <p className="text-xs text-muted-foreground">Sent (24h)</p>
          </div>
          <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-3 text-center">
            <p className="text-lg font-semibold text-red-400">{stats.failed_24h}</p>
            <p className="text-xs text-muted-foreground">Failed (24h)</p>
          </div>
          <div className="rounded-xl border border-orange-500/10 bg-orange-500/5 p-3 text-center">
            <p className="text-lg font-semibold text-orange-400">{stats.dead_letter_24h}</p>
            <p className="text-xs text-muted-foreground">Dead Letter (24h)</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setLoading(true); }}
          className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="dead_letter">Dead Letter</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setLoading(true); }}
          className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs"
        >
          <option value="">All types</option>
          <option value="stage_change">Stage Change</option>
          <option value="daily_digest">Daily Digest</option>
          <option value="broadcast">Broadcast</option>
          <option value="automation">Automation</option>
          <option value="scheduled">Scheduled</option>
        </select>
      </div>

      {/* Log entries */}
      <div className="space-y-1">
        {logs.map((log) => {
          const statusCfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.pending;
          const Icon = statusCfg.icon;

          return (
            <div key={log.id}>
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full rounded-lg border border-white/5 bg-white/[0.02] px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.04] transition-colors text-left"
              >
                <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", statusCfg.bg)}>
                  <Icon className={cn("h-3.5 w-3.5", statusCfg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {TYPE_LABELS[log.notification_type] ?? log.notification_type}
                    </span>
                    {log.deal && (
                      <span className="text-foreground font-medium truncate">
                        {log.deal.deal_name}
                      </span>
                    )}
                    <span className={cn("font-medium", statusCfg.color)}>
                      {statusCfg.label}
                    </span>
                  </div>
                  {log.message_preview && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {log.message_preview}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {timeAgo(log.created_at)}
                </span>
              </button>

              {expandedId === log.id && (
                <div className="ml-10 mt-1 mb-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1.5 text-[10px] text-muted-foreground">
                  <div><span className="text-foreground">Chat ID:</span> {log.tg_chat_id}</div>
                  {log.tg_message_id && (
                    <div><span className="text-foreground">TG Message ID:</span> {log.tg_message_id}</div>
                  )}
                  <div><span className="text-foreground">Retries:</span> {log.retry_count}</div>
                  {log.sent_at && (
                    <div><span className="text-foreground">Sent at:</span> {new Date(log.sent_at).toLocaleString()}</div>
                  )}
                  {log.last_error && (
                    <div className="text-red-400">
                      <span className="text-foreground">Error:</span> {log.last_error}
                    </div>
                  )}
                  {log.message_preview && (
                    <div>
                      <span className="text-foreground">Message:</span>
                      <pre className="mt-1 rounded bg-white/5 p-2 whitespace-pre-wrap">{log.message_preview}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {logs.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              No notification logs yet. Logs appear when notifications are sent.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page with Tabs                                                */
/* ------------------------------------------------------------------ */

type Tab = "preferences" | "delivery-log";

export default function NotificationSettingsPage() {
  const [activeTab, setActiveTab] = React.useState<Tab>("preferences");

  const tabs: { key: Tab; label: string }[] = [
    { key: "preferences", label: "Preferences" },
    { key: "delivery-log", label: "Delivery Log" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage notification preferences and view delivery history.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors relative",
              activeTab === tab.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "preferences" && <PreferencesTab />}
      {activeTab === "delivery-log" && <DeliveryLogTab />}
    </div>
  );
}
