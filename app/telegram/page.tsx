"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegram } from "@/lib/client/telegram-context";
import { useTelegramDialogs } from "@/lib/client/use-telegram-dialogs";
import { useTelegramMessages } from "@/lib/client/use-telegram-messages";
import type { TgDialog } from "@/lib/client/telegram-service";
import {
  MessageCircle,
  Search,
  Send,
  Users,
  User as UserIcon,
  Megaphone,
  RefreshCw,
  ArrowLeft,
  Loader2,
  Smartphone,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

type FilterType = "all" | "private" | "group" | "channel";

// ── Main Component ─────────────────────────────────────────────

export default function TelegramPage() {
  const router = useRouter();
  const tg = useTelegram();
  const { dialogs, loading: dialogsLoading, refresh: refreshDialogs } = useTelegramDialogs();

  const [filter, setFilter] = React.useState<FilterType>("all");
  const [search, setSearch] = React.useState("");
  const [activeDialog, setActiveDialog] = React.useState<TgDialog | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  // Messages hook — driven by active dialog
  const peerType = activeDialog
    ? activeDialog.type === "private"
      ? "user" as const
      : activeDialog.type === "group" || activeDialog.type === "supergroup"
        ? "chat" as const
        : "channel" as const
    : null;

  const {
    messages,
    loading: messagesLoading,
    sendMessage,
    refresh: refreshMessages,
  } = useTelegramMessages(
    peerType,
    activeDialog?.telegramId ?? null,
    activeDialog?.accessHash
  );

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  React.useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    }
  }, [messages.length]);

  async function handleSend() {
    if (!replyText.trim() || !activeDialog || sending) return;
    setSending(true);
    try {
      await sendMessage(replyText.trim());
      setReplyText("");
    } finally {
      setSending(false);
    }
  }

  function selectDialog(dialog: TgDialog) {
    setActiveDialog(dialog);
    setReplyText("");
  }

  // Filter dialogs
  const filtered = dialogs.filter((d) => {
    if (filter === "private" && d.type !== "private") return false;
    if (filter === "group" && d.type !== "group" && d.type !== "supergroup")
      return false;
    if (filter === "channel" && d.type !== "channel") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.username?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filterCounts = React.useMemo(() => {
    const counts = { all: dialogs.length, private: 0, group: 0, channel: 0 };
    for (const d of dialogs) {
      if (d.type === "private") counts.private++;
      else if (d.type === "group" || d.type === "supergroup") counts.group++;
      else if (d.type === "channel") counts.channel++;
    }
    return counts;
  }, [dialogs]);

  function dialogIcon(type: string) {
    switch (type) {
      case "private":
        return <UserIcon className="h-4 w-4 text-muted-foreground" />;
      case "group":
      case "supergroup":
        return <Users className="h-4 w-4 text-muted-foreground" />;
      case "channel":
        return <Megaphone className="h-4 w-4 text-muted-foreground" />;
      default:
        return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
    }
  }

  // ── Loading State ────────────────────────────────────────────

  if (tg.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not Connected CTA ───────────────────────────────────────

  if (tg.status !== "connected") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8 text-center">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#2AABEE]/10 border border-[#2AABEE]/20">
                <MessageCircle className="h-10 w-10 text-[#2AABEE]" />
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-card border border-white/10">
                <Fingerprint className="h-3.5 w-3.5 text-primary" />
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Connect Telegram
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              View your conversations, send messages, and manage contacts
              directly from SupraTeam.
            </p>
          </div>

          {/* CTA */}
          <Button
            size="lg"
            className="bg-[#2AABEE] hover:bg-[#2AABEE]/90 text-white font-medium px-8"
            onClick={() => router.push("/settings/integrations/connect")}
          >
            <Smartphone className="h-4 w-4 mr-2" />
            Connect Telegram
          </Button>

          {/* Zero-knowledge privacy explanation */}
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 text-left space-y-3 max-w-md">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground">
                Zero-Knowledge Architecture
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your Telegram data is protected by <span className="text-foreground">zero-knowledge encryption</span>.
              All messages, contacts, and session data are encrypted with a key that exists
              only on your device. Our server stores an encrypted blob it physically cannot decrypt —
              not even we can access your data.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["AES-256-GCM", "Device-bound key", "Non-extractable", "Direct WebSocket"].map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground">
                  <Fingerprint className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Re-auth prompt for legacy sessions */}
          {tg.status === "needs-reauth" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-400">
                Your previous session used server-side encryption.
                Re-authenticate to upgrade to zero-knowledge encryption.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Connected: 3-Column Layout ──────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* Column 1: Filter Sidebar */}
      <div className="w-[200px] shrink-0 border-r border-white/[0.06] flex flex-col">
        <div className="p-3 border-b border-white/[0.06]">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Chats
          </h2>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {([
            { key: "all" as FilterType, label: "All Chats", icon: MessageCircle },
            { key: "private" as FilterType, label: "Direct Messages", icon: UserIcon },
            { key: "group" as FilterType, label: "Groups", icon: Users },
            { key: "channel" as FilterType, label: "Channels", icon: Megaphone },
          ]).map((item) => {
            const count = filterCounts[item.key];
            return (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  filter === item.key
                    ? "bg-white/[0.08] text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {count > 0 && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Connection info */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-[10px] text-muted-foreground truncate">
              Connected
              {tg.phoneLast4 ? ` (***${tg.phoneLast4})` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <Fingerprint className="h-2.5 w-2.5 text-primary/60" />
            <span className="text-[9px] text-primary/60">Zero-knowledge</span>
          </div>
        </div>
      </div>

      {/* Column 2: Conversation List */}
      <div className="w-[320px] shrink-0 border-r border-white/[0.06] flex flex-col">
        {/* Search + Refresh */}
        <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="pl-8 h-8 text-sm bg-white/[0.03] border-white/[0.06]"
            />
          </div>
          <button
            onClick={refreshDialogs}
            disabled={dialogsLoading}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground",
                dialogsLoading && "animate-spin"
              )}
            />
          </button>
        </div>

        {/* Dialog List */}
        <div className="flex-1 overflow-y-auto">
          {dialogsLoading && dialogs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search
                  ? "No conversations match your search"
                  : "No conversations"}
              </p>
            </div>
          ) : (
            filtered.map((dialog) => (
              <button
                key={dialog.id}
                onClick={() => selectDialog(dialog)}
                className={cn(
                  "w-full flex items-start gap-3 px-3 py-3 text-left border-b border-white/[0.03] transition-colors",
                  activeDialog?.id === dialog.id
                    ? "bg-white/[0.06]"
                    : "hover:bg-white/[0.03]"
                )}
              >
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium bg-white/[0.06] text-muted-foreground">
                  {dialog.type === "private"
                    ? dialog.title.charAt(0).toUpperCase()
                    : dialogIcon(dialog.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {dialog.title}
                    </span>
                    {dialog.lastMessage && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {timeAgo(
                          new Date(
                            dialog.lastMessage.date * 1000
                          ).toISOString()
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {dialog.lastMessage ? (
                      <p className="text-xs text-muted-foreground truncate">
                        {dialog.lastMessage.senderName && (
                          <span className="text-foreground/60">
                            {dialog.lastMessage.senderName}:{" "}
                          </span>
                        )}
                        {dialog.lastMessage.text}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/40 italic">
                        No messages
                      </p>
                    )}
                    {dialog.unreadCount > 0 && (
                      <span className="ml-auto shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-white">
                        {dialog.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Column 3: Message View */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeDialog ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
              <button
                onClick={() => setActiveDialog(null)}
                className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.06]"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium bg-white/[0.06] text-muted-foreground">
                {activeDialog.type === "private"
                  ? activeDialog.title.charAt(0).toUpperCase()
                  : dialogIcon(activeDialog.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">
                  {activeDialog.title}
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {activeDialog.type === "private"
                    ? "Direct Message"
                    : activeDialog.type === "channel"
                      ? "Channel"
                      : "Group"}
                  {activeDialog.username && ` @${activeDialog.username}`}
                </p>
              </div>
              <div className="flex items-center gap-1 text-[9px] text-primary/50">
                <Fingerprint className="h-3 w-3" />
                E2E
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground">No messages</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="group">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {msg.senderName || "Unknown"}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {new Date(msg.date * 1000).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {msg.mediaType && (
                        <span className="text-[10px] text-muted-foreground/40 italic">
                          [{msg.mediaType}]
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">
                      {msg.text ||
                        (msg.mediaType ? `[${msg.mediaType}]` : "[empty]")}
                    </p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply */}
            {activeDialog.type !== "channel" && (
              <div className="border-t border-white/[0.06] p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 resize-none rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <Button
                    size="sm"
                    onClick={handleSend}
                    disabled={!replyText.trim() || sending}
                    className="h-9 w-9 p-0"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Send className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              Select a conversation to read
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              All data stays in your browser — zero-knowledge encrypted
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
