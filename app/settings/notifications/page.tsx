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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";

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

export default function NotificationLogPage() {
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
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Notification Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivery tracking for all outbound Telegram messages.
          </p>
        </div>
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
