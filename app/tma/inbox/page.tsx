"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn, timeAgo } from "@/lib/utils";
import { Inbox, MessageCircle, ChevronRight, User } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { hapticImpact } from "@/components/tma/haptic";

type Conversation = {
  chat_id: number;
  group_name: string;
  group_type: string;
  message_count: number;
  latest_at: string | null;
  messages: {
    sender_name: string;
    sender_username: string | null;
    message_text: string;
    sent_at: string;
    is_from_bot: boolean;
    replies: { sender_name: string; message_text: string; sent_at: string }[];
  }[];
};

type InboxStatus = {
  chat_id: number;
  status: "open" | "snoozed" | "closed";
  assigned_to: string | null;
};

type Deal = {
  id: string;
  deal_name: string;
  board_type: string;
  stage: { name: string; color: string } | null;
};

type Filter = "all" | "open" | "snoozed" | "closed";

export default function TMAInboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [statuses, setStatuses] = React.useState<Map<number, InboxStatus>>(new Map());
  const [deals, setDeals] = React.useState<Record<number, Deal[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("all");

  useTelegramWebApp();

  const fetchData = React.useCallback(async () => {
    try {
      const [inboxRes, statusRes] = await Promise.all([
        fetch("/api/inbox?limit=30"),
        fetch("/api/inbox/status"),
      ]);
      if (inboxRes.ok) {
        const data = await inboxRes.json();
        setConversations(data.conversations ?? []);
        setDeals(data.deals ?? {});
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        const map = new Map<number, InboxStatus>();
        // API returns statuses as a Record<chat_id, status> object, not an array
        const statusObj = data.statuses ?? {};
        for (const key of Object.keys(statusObj)) {
          const s = statusObj[key];
          map.set(Number(key), s);
        }
        setStatuses(map);
      }
    } catch (err) {
      console.error("[tma/inbox] fetch error:", err);
    }
  }, []);

  React.useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = React.useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  async function handleStatusChange(chatId: number, status: "open" | "snoozed" | "closed") {
    hapticImpact("light");
    // Optimistic
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(chatId, { chat_id: chatId, status, assigned_to: prev.get(chatId)?.assigned_to ?? null });
      return next;
    });

    try {
      const body: Record<string, unknown> = { chat_id: chatId, status };
      // API requires snoozed_until when snoozing — default to 24h from now
      if (status === "snoozed") {
        body.snoozed_until = new Date(Date.now() + 24 * 3600000).toISOString();
      }
      await fetch("/api/inbox/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      await fetchData();
    }
  }

  const filtered = conversations.filter((c) => {
    if (filter === "all") return true;
    const s = statuses.get(c.chat_id)?.status ?? "open";
    return s === filter;
  });

  const openCount = conversations.filter((c) => (statuses.get(c.chat_id)?.status ?? "open") === "open").length;

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open", count: openCount },
    { key: "snoozed", label: "Snoozed" },
    { key: "closed", label: "Closed" },
  ];

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-20">
        <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/[0.02] rounded-xl animate-pulse" />)}
        <BottomTabBar active="inbox" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Header */}
        <div className="px-4 pt-4 pb-1 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
            <p className="text-xs text-muted-foreground">{openCount} open conversations</p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="px-4 pb-3 pt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-primary/20 text-primary"
                  : "bg-white/5 text-muted-foreground"
              )}
            >
              {f.label}
              {f.count != null && f.count > 0 && (
                <span className="ml-1 text-[10px]">({f.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="px-4 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <Inbox className="mx-auto h-8 w-8 text-muted-foreground/20" />
              <p className="mt-3 text-xs text-muted-foreground">
                {filter === "all" ? "No conversations yet" : `No ${filter} conversations`}
              </p>
            </div>
          ) : (
            filtered.map((conv) => {
              const status = statuses.get(conv.chat_id)?.status ?? "open";
              const latestMsg = conv.messages[0];
              const chatDeals = deals[conv.chat_id] ?? [];
              const linkedDeal = chatDeals[0];

              return (
                <div
                  key={conv.chat_id}
                  className="rounded-xl border border-white/10 bg-white/[0.035] overflow-hidden"
                >
                  {/* Main row — tap to open deal or TG group */}
                  <button
                    onClick={() => {
                      if (linkedDeal) {
                        router.push(`/tma/deals/${linkedDeal.id}`);
                      } else {
                        // No linked deal — open TG group directly
                        window.open(`https://t.me/c/${String(conv.chat_id).replace(/^-100/, "")}`, "_blank");
                      }
                    }}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition active:bg-white/[0.06]"
                  >
                    <div className="mt-0.5 h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <MessageCircle className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{conv.group_name}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {conv.latest_at && (
                            <span className="text-[10px] text-muted-foreground/60">{timeAgo(conv.latest_at)}</span>
                          )}
                          <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                        </div>
                      </div>

                      {/* Latest message preview */}
                      {latestMsg && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          <span className="font-medium text-foreground/70">
                            {latestMsg.is_from_bot ? "Bot" : latestMsg.sender_name.split(" ")[0]}:
                          </span>{" "}
                          {latestMsg.message_text}
                        </p>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-1">
                        {linkedDeal && (
                          <span className="text-[10px] text-primary truncate max-w-[120px]">
                            {linkedDeal.deal_name}
                          </span>
                        )}
                        {linkedDeal?.stage && (
                          <span className="text-[10px] flex items-center gap-0.5" style={{ color: linkedDeal.stage.color }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: linkedDeal.stage.color }} />
                            {linkedDeal.stage.name}
                          </span>
                        )}
                        <span className={cn(
                          "text-[9px] rounded px-1 py-0.5",
                          status === "open" ? "bg-green-500/20 text-green-400" :
                          status === "snoozed" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-white/5 text-muted-foreground"
                        )}>
                          {status}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40">{conv.message_count} msgs</span>
                      </div>
                    </div>
                  </button>

                  {/* Quick action row */}
                  {status === "open" && (
                    <div className="flex items-center border-t border-white/5 divide-x divide-white/5">
                      <button
                        onClick={() => handleStatusChange(conv.chat_id, "snoozed")}
                        className="flex-1 text-[10px] text-muted-foreground py-2 transition active:bg-white/[0.04]"
                      >
                        Snooze
                      </button>
                      <button
                        onClick={() => handleStatusChange(conv.chat_id, "closed")}
                        className="flex-1 text-[10px] text-muted-foreground py-2 transition active:bg-white/[0.04]"
                      >
                        Close
                      </button>
                    </div>
                  )}
                  {status === "snoozed" && (
                    <div className="flex items-center border-t border-white/5">
                      <button
                        onClick={() => handleStatusChange(conv.chat_id, "open")}
                        className="flex-1 text-[10px] text-yellow-400 py-2 transition active:bg-white/[0.04]"
                      >
                        Reopen
                      </button>
                    </div>
                  )}
                  {status === "closed" && (
                    <div className="flex items-center border-t border-white/5">
                      <button
                        onClick={() => handleStatusChange(conv.chat_id, "open")}
                        className="flex-1 text-[10px] text-green-400 py-2 transition active:bg-white/[0.04]"
                      >
                        Reopen
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PullToRefresh>

      <BottomTabBar active="inbox" />
    </div>
  );
}
