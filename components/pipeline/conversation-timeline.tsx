"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { Send, Loader2, ExternalLink, Search, ChevronUp, MessageCircle, Bot } from "lucide-react";

type Message = {
  id: string;
  sender_name: string | null;
  sender_username: string | null;
  sender_telegram_id: number | null;
  text: string | null;
  message_type: string;
  reply_to_message_id: number | null;
  sent_at: string;
  is_from_bot: boolean;
  tg_deep_link?: string;
  source: "synced" | "notification";
};

type ConversationTimelineProps = {
  dealId: string;
  telegramChatId: number | null;
  telegramChatLink?: string | null;
};

export function ConversationTimeline({ dealId, telegramChatId, telegramChatLink }: ConversationTimelineProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const fetchMessages = React.useCallback(async (cursor?: string) => {
    try {
      const url = `/api/deals/${dealId}/conversation${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (cursor) {
        setMessages((prev) => [...(data.messages ?? []), ...prev]);
      } else {
        setMessages(data.messages ?? []);
      }
      setHasMore(data.hasMore ?? false);
    } catch {
      // silent fail
    }
  }, [dealId]);

  React.useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  // Scroll to bottom on initial load
  React.useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading]);

  async function handleLoadMore() {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    await fetchMessages(messages[0].sent_at);
    setLoadingMore(false);
  }

  async function handleSend() {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (res.ok) {
        setReply("");
        // Refresh messages
        await fetchMessages();
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }
    } finally {
      setSending(false);
    }
  }

  const filtered = React.useMemo(() => {
    if (!searchQuery) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.text?.toLowerCase().includes(q) ||
        m.sender_name?.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  if (!telegramChatId) {
    return (
      <div className="text-center py-10">
        <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/20" />
        <p className="mt-3 text-xs text-muted-foreground">No Telegram chat linked to this deal</p>
        <p className="mt-1 text-[10px] text-muted-foreground/50">Link a TG group in the Details tab to see conversations here.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-22rem)] min-h-[300px]">
      {/* Header with search toggle and TG link */}
      <div className="flex items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{messages.length} messages</span>
          {messages.length > 0 && messages[0].source === "notification" && (
            <span className="text-[9px] text-amber-400/60 bg-amber-400/5 px-1.5 py-0.5 rounded">bot only</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1 rounded hover:bg-white/5 transition-colors text-muted-foreground"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          {telegramChatLink && (
            <a
              href={telegramChatLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-white/5 transition-colors text-blue-400"
              title="Open in Telegram"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="pb-2 shrink-0">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs outline-none focus:border-white/20"
            autoFocus
          />
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 pr-1">
        {/* Load more */}
        {hasMore && (
          <div className="text-center py-2">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 mx-auto"
            >
              {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              Load older messages
            </button>
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/20" />
            <p className="mt-2 text-xs text-muted-foreground">
              {searchQuery ? "No messages match your search" : "No messages yet"}
            </p>
          </div>
        )}

        {/* Message bubbles */}
        {filtered.map((msg, i) => {
          const prevMsg = i > 0 ? filtered[i - 1] : null;
          const sameSender = prevMsg?.sender_telegram_id === msg.sender_telegram_id && prevMsg?.sender_name === msg.sender_name;
          const timeDiff = prevMsg ? new Date(msg.sent_at).getTime() - new Date(prevMsg.sent_at).getTime() : Infinity;
          const showHeader = !sameSender || timeDiff > 5 * 60 * 1000; // 5 min gap
          const showDateSep = !prevMsg || new Date(msg.sent_at).toDateString() !== new Date(prevMsg.sent_at).toDateString();

          return (
            <React.Fragment key={msg.id}>
              {/* Date separator */}
              {showDateSep && (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[9px] text-muted-foreground/40 shrink-0">
                    {new Date(msg.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              )}

              <div className={cn("group", showHeader ? "mt-2" : "mt-0.5")}>
                {/* Sender header */}
                {showHeader && (
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    {msg.is_from_bot ? (
                      <Bot className="h-3 w-3 text-blue-400" />
                    ) : (
                      <div className="h-3 w-3 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-[7px] text-primary font-bold">
                          {(msg.sender_name || "?")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="text-[10px] font-medium text-foreground/80">
                      {msg.sender_name || "Unknown"}
                    </span>
                    {msg.sender_username && (
                      <span className="text-[9px] text-muted-foreground/40">@{msg.sender_username}</span>
                    )}
                  </div>
                )}

                {/* Message bubble */}
                <div className="flex items-start gap-1 px-1">
                  <div className={cn(
                    "flex-1 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed",
                    msg.is_from_bot
                      ? "bg-blue-500/10 border border-blue-500/10"
                      : "bg-white/[0.04]"
                  )}>
                    {msg.message_type !== "text" && !msg.text && (
                      <span className="text-[10px] text-muted-foreground/50 italic">[{msg.message_type}]</span>
                    )}
                    {msg.text && (
                      <p className="text-foreground/90 whitespace-pre-wrap break-words">{msg.text}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground/30">
                        {new Date(msg.sent_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.tg_deep_link && (
                        <a
                          href={msg.tg_deep_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-blue-400/50 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Open in TG
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Reply input */}
      <div className="flex gap-2 pt-2 border-t border-white/5 shrink-0 mt-2">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a reply..."
          className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs outline-none focus:border-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={sending || !reply.trim()}
          className={cn(
            "shrink-0 rounded-lg px-3 py-2 transition-colors",
            reply.trim()
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-white/5 text-muted-foreground/30"
          )}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
