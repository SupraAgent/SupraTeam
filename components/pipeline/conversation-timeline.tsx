"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { Send, Loader2, ExternalLink, Search, ChevronUp, ChevronDown, MessageCircle, Bot, User, Image, FileText, Sparkles, GitBranch, StickyNote, Brain } from "lucide-react";

type Message = {
  id: string;
  sender_name: string | null;
  sender_username: string | null;
  sender_telegram_id: number | null;
  text: string | null;
  message_type: string;
  media_type?: string | null;
  media_file_id?: string | null;
  media_thumb_id?: string | null;
  media_mime?: string | null;
  reply_to_message_id: number | null;
  sent_at: string;
  is_from_bot: boolean;
  tg_deep_link?: string;
  source: "synced" | "notification";
  contact_id?: string | null;
  contact_name?: string | null;
};

type ActivityCard = {
  id: string;
  type: "stage_change" | "note" | "created" | "ai_insight";
  title: string;
  body?: string;
  created_at: string;
};

type TimelineItem =
  | { kind: "message"; data: Message }
  | { kind: "activity"; data: ActivityCard };

type ConversationTimelineProps = {
  dealId: string;
  telegramChatId: number | null;
  telegramChatLink?: string | null;
  onUnreadChange?: (count: number) => void;
  activities?: ActivityCard[];
};

const POLL_INTERVAL = 15_000; // 15 seconds

export function ConversationTimeline({ dealId, telegramChatId, telegramChatLink, onUnreadChange, activities = [] }: ConversationTimelineProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [newMessageCount, setNewMessageCount] = React.useState(0);
  const [suggestions, setSuggestions] = React.useState<Array<{ label: string; text: string }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);

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

  // Poll for new messages
  const pollNewMessages = React.useCallback(async () => {
    if (!telegramChatId || messages.length === 0) return;
    const lastSentAt = messages[messages.length - 1]?.sent_at;
    if (!lastSentAt) return;
    try {
      const url = `/api/deals/${dealId}/conversation?after=${encodeURIComponent(lastSentAt)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const newMsgs: Message[] = data.messages ?? [];
      if (newMsgs.length === 0) return;

      // Dedupe by id
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const unique = newMsgs.filter((m) => !existingIds.has(m.id));
        if (unique.length === 0) return prev;

        if (isAtBottomRef.current) {
          // Auto-scroll if user is at bottom
          setTimeout(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }, 50);
          return [...prev, ...unique];
        }
        // User scrolled up — show "N new messages" pill
        setNewMessageCount((c) => c + unique.length);
        return [...prev, ...unique];
      });
    } catch {
      // silent fail
    }
  }, [dealId, telegramChatId, messages]);

  React.useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  // Auto-refresh polling
  React.useEffect(() => {
    if (!telegramChatId || loading) return;
    const interval = setInterval(pollNewMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [telegramChatId, loading, pollNewMessages]);

  // Track scroll position to determine if user is at bottom
  const handleScroll = React.useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const threshold = 60; // px from bottom
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isAtBottomRef.current && newMessageCount > 0) {
      setNewMessageCount(0);
    }
  }, [newMessageCount]);

  // Scroll to bottom on initial load
  React.useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading]);

  // Mark as read when viewing conversation
  React.useEffect(() => {
    if (!loading && messages.length > 0) {
      fetch(`/api/deals/${dealId}/read-cursor`, { method: "POST" }).catch(() => {});
      onUnreadChange?.(0);
    }
  }, [dealId, loading, messages.length, onUnreadChange]);

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setNewMessageCount(0);
  }

  async function handleLoadMore() {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    await fetchMessages(messages[0].sent_at);
    setLoadingMore(false);
  }

  async function fetchSuggestions() {
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/suggest-replies`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      // silent fail
    } finally {
      setLoadingSuggestions(false);
    }
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

  // Merge messages and activities into a chronological timeline
  const timelineItems = React.useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...filtered.map((m): TimelineItem => ({ kind: "message", data: m })),
      ...activities.map((a): TimelineItem => ({ kind: "activity", data: a })),
    ];
    items.sort((a, b) => {
      const aTime = a.kind === "message" ? a.data.sent_at : a.data.created_at;
      const bTime = b.kind === "message" ? b.data.sent_at : b.data.created_at;
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });
    return items;
  }, [filtered, activities]);

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
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto space-y-1 pr-1">
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
        {timelineItems.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/20" />
            <p className="mt-2 text-xs text-muted-foreground">
              {searchQuery ? "No messages match your search" : "No messages yet"}
            </p>
          </div>
        )}

        {/* Timeline: messages + context cards */}
        {timelineItems.map((item, i) => {
          const itemTime = item.kind === "message" ? item.data.sent_at : item.data.created_at;
          const prevItem = i > 0 ? timelineItems[i - 1] : null;
          const prevTime = prevItem ? (prevItem.kind === "message" ? prevItem.data.sent_at : prevItem.data.created_at) : null;
          const showDateSep = !prevTime || new Date(itemTime).toDateString() !== new Date(prevTime).toDateString();

          // Context card for activities
          if (item.kind === "activity") {
            const act = item.data;
            const icon = act.type === "stage_change" ? <GitBranch className="h-3 w-3" /> :
                         act.type === "note" ? <StickyNote className="h-3 w-3" /> :
                         act.type === "ai_insight" ? <Brain className="h-3 w-3" /> :
                         <MessageCircle className="h-3 w-3" />;
            const color = act.type === "stage_change" ? "border-purple-500/20 bg-purple-500/5 text-purple-300" :
                          act.type === "note" ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-300" :
                          act.type === "ai_insight" ? "border-cyan-500/20 bg-cyan-500/5 text-cyan-300" :
                          "border-white/10 bg-white/[0.03] text-muted-foreground";
            return (
              <React.Fragment key={`act-${act.id}`}>
                {showDateSep && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-[9px] text-muted-foreground/40 shrink-0">
                      {new Date(itemTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                )}
                <ActivityCardItem act={act} icon={icon} color={color} />
              </React.Fragment>
            );
          }

          // Regular message
          const msg = item.data;
          const prevMsg = prevItem?.kind === "message" ? prevItem.data : null;
          const sameSender = prevMsg?.sender_telegram_id === msg.sender_telegram_id && prevMsg?.sender_name === msg.sender_name;
          const timeDiff = prevMsg ? new Date(msg.sent_at).getTime() - new Date(prevMsg.sent_at).getTime() : Infinity;
          const showHeader = !sameSender || timeDiff > 5 * 60 * 1000; // 5 min gap

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
                    ) : msg.contact_id ? (
                      <User className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <div className="h-3 w-3 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-[7px] text-primary font-bold">
                          {(msg.sender_name || "?")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="text-[10px] font-medium text-foreground/80">
                      {msg.contact_name || msg.sender_name || "Unknown"}
                    </span>
                    {msg.sender_username && (
                      <span className="text-[9px] text-muted-foreground/40">@{msg.sender_username}</span>
                    )}
                    {msg.contact_id && (
                      <span className="text-[8px] text-emerald-400/60 bg-emerald-400/5 px-1 py-0.5 rounded">contact</span>
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
                    {msg.media_type && msg.media_file_id && (
                      <MediaPreview
                        mediaType={msg.media_type}
                        fileId={msg.media_thumb_id ?? msg.media_file_id}
                        mime={msg.media_mime}
                      />
                    )}
                    {msg.media_type && !msg.media_file_id && (
                      <span className="text-[10px] text-muted-foreground/50 italic flex items-center gap-1 mb-0.5">
                        [{msg.media_type}]
                      </span>
                    )}
                    {msg.message_type !== "text" && !msg.text && !msg.media_type && (
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

      {/* New messages pill */}
      {newMessageCount > 0 && (
        <button
          onClick={scrollToBottom}
          className="flex items-center gap-1 mx-auto py-1 px-3 rounded-full bg-primary text-primary-foreground text-[10px] font-medium shadow-lg hover:bg-primary/90 transition-colors shrink-0"
        >
          <ChevronDown className="h-3 w-3" />
          {newMessageCount} new message{newMessageCount !== 1 ? "s" : ""}
        </button>
      )}

      {/* Smart reply suggestions */}
      {messages.length > 0 && (
        <div className="shrink-0 mt-1">
          {suggestions.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Sparkles className="h-3 w-3 text-purple-400 shrink-0" />
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setReply(s.text); setSuggestions([]); }}
                  className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-2.5 py-1 text-[10px] text-purple-300 hover:bg-purple-500/10 transition-colors truncate max-w-[180px]"
                  title={s.text}
                >
                  {s.label}
                </button>
              ))}
              <button
                onClick={() => setSuggestions([])}
                className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                dismiss
              </button>
            </div>
          ) : (
            <button
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-purple-400 transition-colors"
            >
              {loadingSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {loadingSuggestions ? "Thinking..." : "Suggest replies"}
            </button>
          )}
        </div>
      )}

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

/** Context card for activities (stage changes, notes, AI insights) */
function ActivityCardItem({ act, icon, color }: { act: ActivityCard; icon: React.ReactNode; color: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasBody = !!act.body && act.body.length > 0;
  const isLongBody = hasBody && act.body!.length > 60;

  return (
    <div
      className={cn(
        "flex items-start gap-2 mx-2 my-2 rounded-lg border px-3 py-1.5",
        color,
        isLongBody && "cursor-pointer"
      )}
      onClick={isLongBody ? () => setExpanded(!expanded) : undefined}
      role={isLongBody ? "button" : undefined}
      aria-expanded={isLongBody ? expanded : undefined}
    >
      <span className="shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
      <span className="sr-only">{act.type.replace("_", " ")}:</span>
      <span className="text-[10px] font-medium flex-1 min-w-0">
        {act.title}
        {hasBody && (
          <span className={cn("block text-[9px] opacity-70 mt-0.5", !expanded && "truncate")}>
            {act.body}
          </span>
        )}
      </span>
      <span className="text-[9px] opacity-50 shrink-0 mt-0.5">{timeAgo(act.created_at)}</span>
    </div>
  );
}

/** Inline media preview for photos and documents */
function MediaPreview({ mediaType, fileId, mime }: { mediaType: string; fileId: string; mime?: string | null }) {
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);
  const proxyUrl = `/api/telegram-media?file_id=${encodeURIComponent(fileId)}`;

  if (mediaType === "photo" || mediaType === "animation") {
    return (
      <div className="mb-1 relative">
        {!loaded && !error && (
          <div className="h-32 w-full max-w-[240px] rounded bg-white/5 animate-pulse flex items-center justify-center">
            <Image className="h-5 w-5 text-muted-foreground/20" />
          </div>
        )}
        {!error && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyUrl}
            alt="Photo"
            className={cn(
              "rounded max-w-[240px] max-h-[200px] object-cover cursor-pointer hover:opacity-90 transition-opacity",
              !loaded && "hidden"
            )}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            onClick={() => window.open(proxyUrl, "_blank")}
          />
        )}
        {error && (
          <span className="text-[10px] text-muted-foreground/50 italic flex items-center gap-1">
            <Image className="h-3 w-3" /> [photo unavailable]
          </span>
        )}
      </div>
    );
  }

  if (mediaType === "document" || mediaType === "video" || mediaType === "voice" || mediaType === "sticker") {
    return (
      <a
        href={proxyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-1.5 mb-1 w-fit hover:bg-white/[0.06] transition-colors"
      >
        <FileText className="h-4 w-4 text-blue-400 shrink-0" />
        <span className="text-[10px] text-foreground/80">{mediaType}</span>
        {mime && <span className="text-[9px] text-muted-foreground/40">{mime}</span>}
      </a>
    );
  }

  return (
    <span className="text-[10px] text-muted-foreground/50 italic flex items-center gap-1 mb-0.5">
      [{mediaType}]
    </span>
  );
}
