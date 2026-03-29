"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  History,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Calendar,
  Send,
  Ban,
  MessageCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { Broadcast } from "./types";

const STATUS_ICONS: Record<string, React.ElementType> = {
  sent: CheckCircle,
  failed: XCircle,
  scheduled: Calendar,
  sending: Send,
  cancelled: Ban,
  draft: MessageCircle,
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  sent: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Sent" },
  failed: { color: "text-red-400", bg: "bg-red-500/10", label: "Failed" },
  scheduled: { color: "text-blue-400", bg: "bg-blue-500/10", label: "Scheduled" },
  sending: { color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Sending" },
  cancelled: { color: "text-muted-foreground", bg: "bg-white/5", label: "Cancelled" },
  draft: { color: "text-muted-foreground", bg: "bg-white/5", label: "Draft" },
};

interface BroadcastHistoryProps {
  broadcasts: Broadcast[];
  loading: boolean;
  onRefresh: () => void;
  onCancel: (id: string) => void;
  onReuse: (text: string) => void;
}

export function BroadcastHistory({ broadcasts, loading, onRefresh, onCancel, onReuse }: BroadcastHistoryProps) {
  const [expandedBroadcast, setExpandedBroadcast] = React.useState<string | null>(null);
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = React.useState<string | null>(null);

  const filteredBroadcasts = React.useMemo(() => {
    let result = broadcasts;
    if (historySearch) {
      const q = historySearch.toLowerCase();
      result = result.filter((b) =>
        b.message_text.toLowerCase().includes(q) ||
        b.sender_name?.toLowerCase().includes(q) ||
        b.slug_filter?.toLowerCase().includes(q)
      );
    }
    if (historyStatusFilter) {
      result = result.filter((b) => b.status === historyStatusFilter);
    }
    return result;
  }, [broadcasts, historySearch, historyStatusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Broadcast History</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {/* History search & filters */}
      {broadcasts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            <Input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search broadcasts..."
              className="h-7 pl-7 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {["sent", "scheduled", "failed", "cancelled"].map((s) => {
              const cfg = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  onClick={() => setHistoryStatusFilter(historyStatusFilter === s ? null : s)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                    historyStatusFilter === s ? `${cfg.bg} ${cfg.color}` : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
          {(historySearch || historyStatusFilter) && (
            <span className="text-[10px] text-muted-foreground">
              {filteredBroadcasts.length}/{broadcasts.length}
            </span>
          )}
        </div>
      )}

      {broadcasts.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            No broadcasts sent yet.
          </p>
        </div>
      )}

      {filteredBroadcasts.map((b) => {
        const cfg = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.draft;
        const Icon = STATUS_ICONS[b.status] ?? STATUS_ICONS.draft;
        const isExpanded = expandedBroadcast === b.id;

        return (
          <div
            key={b.id}
            className="rounded-xl border border-white/10 bg-white/[0.035] overflow-hidden"
          >
            <button
              onClick={() =>
                setExpandedBroadcast(isExpanded ? null : b.id)
              }
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                  cfg.bg
                )}
              >
                <Icon className={cn("h-4 w-4", cfg.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {b.message_text.length > 80
                    ? b.message_text.slice(0, 80) + "..."
                    : b.message_text}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span className={cfg.color}>{cfg.label}</span>
                  {b.sender_name && <span>by {b.sender_name}</span>}
                  {b.slug_filter && (
                    <span className="rounded bg-primary/10 text-primary px-1 py-0.5">
                      {b.slug_filter}
                    </span>
                  )}
                  <span>
                    {b.sent_count}/{b.group_count} groups
                  </span>
                  <span>
                    {b.sent_at
                      ? timeAgo(b.sent_at)
                      : b.scheduled_at
                        ? `Scheduled: ${new Date(b.scheduled_at).toLocaleString()}`
                        : timeAgo(b.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {b.status === "scheduled" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel(b.id);
                    }}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReuse(b.message_text);
                  }}
                >
                  Reuse
                </Button>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-white/5 px-4 py-3 space-y-2">
                <div className="rounded-lg bg-white/[0.02] p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {b.message_text}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Recipients
                  </p>
                  {b.recipients?.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between py-1 border-b border-white/5 last:border-0"
                    >
                      <span className="text-xs text-foreground">
                        {r.group_name}
                      </span>
                      {r.status === "sent" ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <Check className="h-3 w-3" /> Sent{" "}
                          {r.sent_at && timeAgo(r.sent_at)}
                        </span>
                      ) : r.status === "failed" ? (
                        <span
                          className="flex items-center gap-1 text-[10px] text-red-400"
                          title={r.error ?? ""}
                        >
                          <X className="h-3 w-3" /> Failed
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Pending
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
