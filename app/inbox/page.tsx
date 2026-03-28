"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageCircle,
  Search,
  Users,
  ExternalLink,
  Reply,
  Clock,
  ChevronDown,
  ChevronRight,
  Inbox as InboxIcon,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface ThreadMessage {
  id: string;
  telegram_message_id: number;
  telegram_chat_id: number;
  sender_telegram_id: number;
  sender_name: string;
  sender_username: string | null;
  message_text: string;
  message_type: string;
  reply_to_message_id: number | null;
  sent_at: string;
  is_from_bot: boolean;
  replies: ThreadMessage[];
}

interface Conversation {
  chat_id: number;
  group_name: string;
  group_type: string;
  tg_group_id: string;
  member_count: number | null;
  message_count: number;
  latest_at: string | null;
  messages: ThreadMessage[];
}

interface Deal {
  id: string;
  deal_name: string;
  board_type: string;
  stage: { name: string; color: string } | null;
  assigned_to: string | null;
  contact: { id: string; name: string } | null;
}

export default function InboxPage() {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [deals, setDeals] = React.useState<Record<number, Deal[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selectedChat, setSelectedChat] = React.useState<number | null>(null);
  const [expandedThreads, setExpandedThreads] = React.useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = React.useState(false);

  const fetchInbox = React.useCallback(async () => {
    try {
      const res = await fetch("/api/inbox");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
        setDeals(data.deals ?? {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // Supabase realtime: subscribe to new group messages (debounced)
  React.useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("inbox-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tg_group_messages" },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => fetchInbox(), 1000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchInbox]);

  function handleRefresh() {
    setRefreshing(true);
    fetchInbox();
  }

  function toggleThread(messageId: number) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  // Filter conversations by search
  const filtered = React.useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) =>
      c.group_name.toLowerCase().includes(q) ||
      c.messages.some((m) =>
        m.message_text?.toLowerCase().includes(q) ||
        m.sender_name.toLowerCase().includes(q)
      )
    );
  }, [conversations, search]);

  const selectedConversation = selectedChat
    ? filtered.find((c) => c.chat_id === selectedChat)
    : null;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-[60vh] rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unified view of Telegram conversations across CRM-linked groups.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations, messages, or senders..."
          className="pl-9 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {search ? "No conversations match your search." : "No messages yet. Messages from CRM-linked Telegram groups will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[60vh]">
          {/* Conversation list */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="divide-y divide-white/5">
              {filtered.map((conv) => {
                const chatDeals = deals[conv.chat_id] ?? [];
                const lastMsg = conv.messages[0];
                const isSelected = selectedChat === conv.chat_id;

                return (
                  <button
                    key={conv.chat_id}
                    onClick={() => setSelectedChat(conv.chat_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-white/[0.04]"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{conv.group_name}</span>
                      {conv.member_count && (
                        <span className="text-[10px] text-muted-foreground/50 shrink-0 flex items-center gap-0.5">
                          <Users className="h-2.5 w-2.5" />
                          {conv.member_count}
                        </span>
                      )}
                    </div>

                    {lastMsg && (
                      <p className="text-[11px] text-muted-foreground truncate pl-5">
                        <span className="text-foreground/70">{lastMsg.sender_name.split(" ")[0]}:</span>{" "}
                        {lastMsg.message_text?.slice(0, 80) ?? "(media)"}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pl-5 mt-0.5">
                      {conv.latest_at && (
                        <span className="text-[10px] text-muted-foreground/50">
                          {timeAgo(conv.latest_at)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/30">
                        {conv.message_count} msgs
                      </span>
                      {chatDeals.length > 0 && (
                        <span className="text-[10px] text-primary/70">
                          {chatDeals.length} deal{chatDeals.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message detail */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            {selectedConversation ? (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-foreground">{selectedConversation.group_name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(deals[selectedConversation.chat_id] ?? []).map((deal) => (
                        <a
                          key={deal.id}
                          href={`/pipeline?highlight=${deal.id}`}
                          className="text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {deal.deal_name}
                          {deal.stage && (
                            <span className="text-muted-foreground"> ({(deal.stage as { name: string }).name})</span>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedConversation.message_count} messages
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 thin-scroll">
                  {selectedConversation.messages.map((msg) => {
                    const hasReplies = msg.replies.length > 0;
                    const isExpanded = expandedThreads.has(msg.telegram_message_id);

                    return (
                      <div key={msg.id} className="group">
                        <MessageBubble msg={msg} />

                        {hasReplies && (
                          <div className="ml-6 mt-1">
                            <button
                              onClick={() => toggleThread(msg.telegram_message_id)}
                              className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              <Reply className="h-3 w-3" />
                              {msg.replies.length} repl{msg.replies.length === 1 ? "y" : "ies"}
                            </button>

                            {isExpanded && (
                              <div className="mt-1 space-y-1 border-l-2 border-white/5 pl-3">
                                {msg.replies.map((reply) => (
                                  <MessageBubble key={reply.id} msg={reply} compact />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {selectedConversation.messages.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-8">No messages in this group yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <div className="text-center">
                  <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground/20" />
                  <p className="mt-2 text-sm text-muted-foreground/50">
                    Select a conversation to view messages
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, compact }: { msg: ThreadMessage; compact?: boolean }) {
  const chatIdStr = String(msg.telegram_chat_id);
  const supergroupId = chatIdStr.startsWith("-100") ? chatIdStr.slice(4) : null;
  const deepLink = supergroupId
    ? `https://t.me/c/${supergroupId}/${msg.telegram_message_id}`
    : null;

  return (
    <div className={cn("flex gap-2", compact ? "py-0.5" : "py-1")}>
      <div className={cn(
        "flex items-center justify-center rounded-full shrink-0 font-bold",
        msg.is_from_bot ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground",
        compact ? "h-5 w-5 text-[8px]" : "h-7 w-7 text-[10px]"
      )}>
        {msg.sender_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("font-medium text-foreground", compact ? "text-[10px]" : "text-xs")}>
            {msg.sender_name}
          </span>
          {msg.sender_username && (
            <span className="text-[10px] text-muted-foreground/50">@{msg.sender_username}</span>
          )}
          <span className="text-[10px] text-muted-foreground/40 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(msg.sent_at)}
          </span>
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/30 hover:text-primary transition-colors"
              title="Open in Telegram"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <p className={cn(
          "text-muted-foreground whitespace-pre-wrap break-words",
          compact ? "text-[10px]" : "text-xs"
        )}>
          {msg.message_text ?? `(${msg.message_type})`}
        </p>
      </div>
    </div>
  );
}
