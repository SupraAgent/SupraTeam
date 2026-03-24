"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Dialog = {
  id: string;
  type: "private" | "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  unreadCount: number;
  lastMessage?: {
    text: string;
    date: number;
    senderName?: string;
  };
  telegramId: number;
  accessHash?: string;
  isCrmLinked: boolean;
};

type Message = {
  id: number;
  text: string;
  date: number;
  senderId?: number;
  senderName?: string;
  replyToId?: number;
  mediaType?: string;
};

type Tab = "all" | "private" | "group" | "channel";

export default function ConversationsPage() {
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [dialogs, setDialogs] = React.useState<Dialog[]>([]);
  const [activeDialog, setActiveDialog] = React.useState<Dialog | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [messageText, setMessageText] = React.useState("");
  const [tab, setTab] = React.useState<Tab>("all");
  const [search, setSearch] = React.useState("");
  const [loadingDialogs, setLoadingDialogs] = React.useState(false);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    checkConnection();
  }, []);

  React.useEffect(() => {
    if (connected) fetchDialogs();
  }, [connected, tab]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function checkConnection() {
    const res = await fetch("/api/telegram-client/status");
    const data = await res.json();
    setConnected(data.connected);
  }

  async function fetchDialogs() {
    setLoadingDialogs(true);
    setError("");
    try {
      const typeParam = tab === "all" ? "" : `&type=${tab}`;
      const res = await fetch(`/api/telegram-client/conversations?limit=100${typeParam}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load conversations");
        return;
      }
      setDialogs(data.data || []);
    } finally {
      setLoadingDialogs(false);
    }
  }

  async function openDialog(dialog: Dialog) {
    setActiveDialog(dialog);
    setLoadingMessages(true);
    setMessages([]);
    try {
      const peerType = dialog.type === "private" ? "user" : dialog.type === "group" ? "chat" : "channel";
      const params = new URLSearchParams({
        type: peerType,
        id: String(dialog.telegramId),
        limit: "50",
      });
      if (dialog.accessHash) params.set("accessHash", dialog.accessHash);

      const res = await fetch(`/api/telegram-client/messages?${params}`);
      const data = await res.json();
      if (res.ok) {
        setMessages((data.data || []).reverse());
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSend() {
    if (!messageText.trim() || !activeDialog) return;
    setSending(true);
    try {
      const peerType = activeDialog.type === "private" ? "user" : activeDialog.type === "group" ? "chat" : "channel";
      const res = await fetch("/api/telegram-client/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: peerType,
          id: String(activeDialog.telegramId),
          accessHash: activeDialog.accessHash,
          message: messageText.trim(),
        }),
      });
      if (res.ok) {
        setMessageText("");
        // Refresh messages
        openDialog(activeDialog);
      }
    } finally {
      setSending(false);
    }
  }

  const filteredDialogs = search
    ? dialogs.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
    : dialogs;

  // Not connected
  if (connected === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Conversations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your Telegram account to view conversations.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center space-y-4">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-[#2AABEE]/10">
            <TelegramIcon className="h-6 w-6 text-[#2AABEE]" />
          </div>
          <p className="text-sm text-muted-foreground">
            Your Telegram account is not connected.
          </p>
          <a
            href="/settings/integrations/connect"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium h-9 px-3 hover:brightness-110 transition-all"
          >
            Connect Telegram
          </a>
        </div>
      </div>
    );
  }

  if (connected === null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-foreground">Conversations</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Conversations</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            DMs are fetched live and never stored. CRM-linked group messages are synced.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchDialogs} disabled={loadingDialogs}>
          <RefreshIcon className={`h-3.5 w-3.5 mr-1 ${loadingDialogs ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* Dialog list */}
        <div className="w-80 shrink-0 rounded-2xl border border-white/10 bg-white/[0.035] flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/10 text-xs">
            {(["all", "private", "group", "channel"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 font-medium transition-colors capitalize ${
                  tab === t
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "private" ? "DMs" : t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="text-xs h-8"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto thin-scroll">
            {loadingDialogs && filteredDialogs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>
            )}
            {!loadingDialogs && filteredDialogs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No conversations</p>
            )}
            {filteredDialogs.map((d) => (
              <button
                key={d.id}
                onClick={() => openDialog(d)}
                className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors ${
                  activeDialog?.id === d.id ? "bg-white/10" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                      d.type === "private" ? "bg-blue-500/20 text-blue-400" :
                      d.type === "group" || d.type === "supergroup" ? "bg-green-500/20 text-green-400" :
                      "bg-purple-500/20 text-purple-400"
                    }`}>
                      {d.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {d.title}
                        {d.isCrmLinked && (
                          <span className="ml-1 text-[10px] text-primary">CRM</span>
                        )}
                      </p>
                      {d.lastMessage && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {d.lastMessage.senderName && `${d.lastMessage.senderName}: `}
                          {d.lastMessage.text}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    {d.lastMessage && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(d.lastMessage.date)}
                      </span>
                    )}
                    {d.unreadCount > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                        {d.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Message view */}
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.035] flex flex-col overflow-hidden">
          {!activeDialog ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                <div>
                  <p className="text-sm font-medium text-foreground">{activeDialog.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeDialog.type === "private" ? "Private chat" :
                     activeDialog.type === "group" ? "Group" :
                     activeDialog.type === "supergroup" ? "Supergroup" : "Channel"}
                    {activeDialog.username && ` · @${activeDialog.username}`}
                    {activeDialog.isCrmLinked && " · CRM-linked"}
                  </p>
                </div>
                {activeDialog.type === "private" && (
                  <span className="ml-auto rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                    Live only — not stored
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-2">
                {loadingMessages && (
                  <p className="text-xs text-muted-foreground text-center py-8">Loading messages...</p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className="group">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground shrink-0">
                        {m.senderName || "Unknown"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(m.date)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                      {m.text || (m.mediaType ? `[${m.mediaType}]` : "[empty]")}
                    </p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div className="border-t border-white/10 p-3">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button size="sm" onClick={handleSend} disabled={sending || !messageText.trim()}>
                    {sending ? "..." : "Send"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(unix: number): string {
  const d = new Date(unix * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  );
}
