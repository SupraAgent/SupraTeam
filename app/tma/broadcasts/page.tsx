"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Send, Loader2, CheckCircle, XCircle, Radio, Clock } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { useTelegramWebApp } from "@/components/tma/use-telegram";

type TgGroup = {
  id: string;
  group_name: string;
  telegram_group_id: string;
  bot_is_admin: boolean;
  slugs: string[];
};

type BroadcastHistory = {
  id: string;
  message_text: string;
  status: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

export default function TMABroadcastsPage() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [history, setHistory] = React.useState<BroadcastHistory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedGroups, setSelectedGroups] = React.useState<Set<string>>(new Set());
  const [selectedSlug, setSelectedSlug] = React.useState<string>("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const sentTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up sent timer on unmount
  React.useEffect(() => {
    return () => { if (sentTimerRef.current) clearTimeout(sentTimerRef.current); };
  }, []);
  const mainButtonText = selectedGroups.size > 0 && message.trim() ? `Send to ${selectedGroups.size} group${selectedGroups.size > 1 ? "s" : ""}` : undefined;
  useTelegramWebApp({
    mainButtonText,
    onMainButton: mainButtonText ? () => handleSend() : undefined,
    mainButtonDisabled: sending || !message.trim() || selectedGroups.size === 0,
    mainButtonLoading: sending,
  });

  React.useEffect(() => {
    Promise.all([
      fetch("/api/groups").then((r) => r.json()).catch(() => ({ groups: [] })),
      fetch("/api/broadcasts?limit=5").then((r) => r.ok ? r.json() : { broadcasts: [] }).catch(() => ({ broadcasts: [] })),
    ]).then(([groupsData, historyData]) => {
      setGroups(groupsData.groups ?? []);
      setHistory(historyData.broadcasts ?? []);
    }).finally(() => setLoading(false));
  }, []);

  // Get unique slugs
  const slugs = React.useMemo(() => {
    const all = new Set<string>();
    groups.forEach((g) => g.slugs?.forEach((s) => all.add(s)));
    return Array.from(all).sort();
  }, [groups]);

  // Filter groups by slug
  const filteredGroups = React.useMemo(() => {
    if (!selectedSlug) return groups;
    return groups.filter((g) => g.slugs?.includes(selectedSlug));
  }, [groups, selectedSlug]);

  function toggleGroup(id: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedGroups(new Set(filteredGroups.filter((g) => g.bot_is_admin).map((g) => g.id)));
  }

  async function handleSend() {
    if (!message.trim() || selectedGroups.size === 0 || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_text: message.trim(),
          group_ids: Array.from(selectedGroups),
        }),
      });
      if (res.ok) {
        setSent(true);
        setMessage("");
        setSelectedGroups(new Set());
        if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
        sentTimerRef.current = setTimeout(() => setSent(false), 3000);
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-20">
        <div className="h-6 w-32 bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />)}
        <BottomTabBar active="more" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Broadcasts</h1>
        <p className="text-xs text-muted-foreground">Send messages to TG groups</p>
      </div>

      {/* Message */}
      <div className="px-4 pb-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your broadcast message..."
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm outline-none focus:border-primary/30 resize-none"
        />
        <p className="mt-1 text-[9px] text-muted-foreground/50">
          Variables: {"{{deal_name}}"}, {"{{contact_name}}"}, {"{{stage}}"}
        </p>
      </div>

      {/* Slug filter */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => { setSelectedSlug(""); setSelectedGroups(new Set()); }}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            !selectedSlug ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
          )}
        >
          All groups
        </button>
        {slugs.map((slug) => (
          <button
            key={slug}
            onClick={() => { setSelectedSlug(slug); setSelectedGroups(new Set()); }}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedSlug === slug ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
            )}
          >
            {slug}
          </button>
        ))}
      </div>

      {/* Group selection */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{selectedGroups.size} of {filteredGroups.length} selected</p>
          <button onClick={selectAll} className="text-[10px] text-primary">Select all</button>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {filteredGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => toggleGroup(g.id)}
              disabled={!g.bot_is_admin}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                selectedGroups.has(g.id) ? "bg-primary/10 border border-primary/20" : "bg-white/[0.03] border border-transparent",
                !g.bot_is_admin && "opacity-40"
              )}
            >
              <div className={cn(
                "h-4 w-4 rounded border shrink-0 flex items-center justify-center",
                selectedGroups.has(g.id) ? "bg-primary border-primary" : "border-white/20"
              )}>
                {selectedGroups.has(g.id) && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className="text-xs text-foreground truncate">{g.group_name}</span>
              {!g.bot_is_admin && <span className="text-[9px] text-red-400 shrink-0">No admin</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Send button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleSend}
          disabled={sending || !message.trim() || selectedGroups.size === 0}
          className={cn(
            "w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
            message.trim() && selectedGroups.size > 0
              ? "bg-primary text-primary-foreground"
              : "bg-white/5 text-muted-foreground/30"
          )}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? <CheckCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending..." : sent ? "Sent!" : `Send to ${selectedGroups.size} group${selectedGroups.size !== 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div className="px-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
          <div className="space-y-1.5">
            {history.map((b) => {
              const StatusIcon = b.status === "sent" ? CheckCircle : b.status === "failed" ? XCircle : b.status === "sending" ? Radio : Clock;
              const statusColor = b.status === "sent" ? "text-emerald-400" : b.status === "failed" ? "text-red-400" : "text-muted-foreground";
              return (
                <div key={b.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <p className="text-xs text-foreground line-clamp-1">{b.message_text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusIcon className={cn("h-3 w-3", statusColor)} />
                    <span className="text-[10px] text-muted-foreground">
                      {b.sent_count} sent{b.failed_count > 0 ? `, ${b.failed_count} failed` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <BottomTabBar active="more" />
    </div>
  );
}
