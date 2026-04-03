"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegram } from "@/lib/client/telegram-context";
import { useTelegramDialogs } from "@/lib/client/use-telegram-dialogs";
import { useTelegramMessages } from "@/lib/client/use-telegram-messages";
import type { TgDialog, TgMessage } from "@/lib/client/telegram-service";
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
  WifiOff,
  Check,
  Forward,
  Pin,
  BellOff,
  Archive,
  X,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Image,
  FileText,
  Reply,
  Hash,
  Command,
} from "lucide-react";
import { EmojiPicker } from "@/components/ui/emoji-picker";

// ── Types ──────────────────────────────────────────────────────

type FilterType = "all" | "unread" | "private" | "group" | "channel";

interface ChatFolder {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  is_collapsed: boolean;
  position: number;
  members: { telegram_chat_id: number; chat_title: string | null }[];
}

interface ChatContextMenu {
  x: number;
  y: number;
  dialog: TgDialog;
}

// Quick reaction emojis
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "😮", "😢"];

// ── Main Component ─────────────────────────────────────────────

export default function TelegramPage() {
  const router = useRouter();
  const tg = useTelegram();
  const { dialogs, loading: dialogsLoading, refresh: refreshDialogs } = useTelegramDialogs();

  // Core state
  const [filter, setFilter] = React.useState<FilterType>("all");
  const [search, setSearch] = React.useState("");
  const [activeDialog, setActiveDialog] = React.useState<TgDialog | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [lastSentId, setLastSentId] = React.useState<number | null>(null);
  const replyTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Message search
  const [msgSearch, setMsgSearch] = React.useState("");
  const [msgSearchActive, setMsgSearchActive] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<TgMessage[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Reply-to specific message
  const [replyToMsg, setReplyToMsg] = React.useState<TgMessage | null>(null);

  // Forward dialog picker
  const [forwardMsg, setForwardMsg] = React.useState<TgMessage | null>(null);
  const [forwardSearch, setForwardSearch] = React.useState("");

  // Context menu
  const [contextMenu, setContextMenu] = React.useState<ChatContextMenu | null>(null);

  // Folders
  const [folders, setFolders] = React.useState<ChatFolder[]>([]);
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");

  // Command palette
  const [showPalette, setShowPalette] = React.useState(false);
  const [paletteQuery, setPaletteQuery] = React.useState("");

  // @mention
  const [mentionActive, setMentionActive] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [chatMembers, setChatMembers] = React.useState<{ userId: number; firstName: string; lastName?: string; username?: string }[]>([]);

  // Pinned/muted state (local — persisted in localStorage)
  const [pinnedChats, setPinnedChats] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem("tg_pinned") ?? "[]"));
    } catch { return new Set(); }
  });
  const [mutedChats, setMutedChats] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem("tg_muted") ?? "[]"));
    } catch { return new Set(); }
  });

  // Persist pinned/muted
  React.useEffect(() => {
    localStorage.setItem("tg_pinned", JSON.stringify([...pinnedChats]));
  }, [pinnedChats]);
  React.useEffect(() => {
    localStorage.setItem("tg_muted", JSON.stringify([...mutedChats]));
  }, [mutedChats]);

  // Messages hook
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
    if (messages.length > 0 && !msgSearchActive) {
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    }
  }, [messages.length, msgSearchActive]);

  // Auto-refresh messages every 5 seconds
  React.useEffect(() => {
    if (!activeDialog || tg.status !== "connected") return;
    const interval = setInterval(refreshMessages, 5000);
    return () => clearInterval(interval);
  }, [activeDialog, tg.status, refreshMessages]);

  // Mark as read when opening a dialog — track last sent maxId to avoid redundant calls
  const lastReadMaxIdRef = React.useRef<number>(0);
  React.useEffect(() => {
    if (!activeDialog || tg.status !== "connected" || !peerType || messages.length === 0) return;
    const maxId = Math.max(...messages.map((m) => m.id));
    if (activeDialog.unreadCount > 0 && maxId > lastReadMaxIdRef.current) {
      lastReadMaxIdRef.current = maxId;
      tg.service.markAsRead(peerType, activeDialog.telegramId, activeDialog.accessHash, maxId).catch(() => {});
    }
  }, [activeDialog, messages.length, tg.status, tg.service, peerType]);

  // Reset lastReadMaxId when switching dialogs
  React.useEffect(() => {
    lastReadMaxIdRef.current = 0;
  }, [activeDialog?.id]);

  // Fetch folders
  React.useEffect(() => {
    fetch("/api/telegram/groups")
      .then((r) => r.json())
      .then((d) => { if (d.data) setFolders(d.data); })
      .catch(() => {});
  }, []);

  // Fetch chat members when entering a group/supergroup
  React.useEffect(() => {
    if (!activeDialog || tg.status !== "connected") { setChatMembers([]); return; }
    if (activeDialog.type !== "group" && activeDialog.type !== "supergroup") { setChatMembers([]); return; }
    const pt = activeDialog.type === "group" ? "chat" as const : "channel" as const;
    tg.service.getChatMembers(pt, activeDialog.telegramId, activeDialog.accessHash)
      .then(setChatMembers)
      .catch(() => setChatMembers([]));
  }, [activeDialog, tg.status, tg.service]);

  // ── Keyboard Shortcuts ────────────────────────────────────────

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      // Cmd+F / Ctrl+F in message view — message search
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && activeDialog) {
        e.preventDefault();
        setMsgSearchActive(true);
      }
      // Escape
      if (e.key === "Escape") {
        if (showPalette) setShowPalette(false);
        else if (forwardMsg) setForwardMsg(null);
        else if (msgSearchActive) { setMsgSearchActive(false); setMsgSearch(""); setSearchResults([]); }
        else if (replyToMsg) setReplyToMsg(null);
        else if (contextMenu) setContextMenu(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, showPalette, forwardMsg, msgSearchActive, replyToMsg, contextMenu]);

  // ── Message Search ────────────────────────────────────────────

  React.useEffect(() => {
    if (!msgSearch.trim() || !activeDialog || !peerType) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await tg.service.searchMessages(
          peerType, activeDialog.telegramId, activeDialog.accessHash, msgSearch.trim()
        );
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timeout);
  }, [msgSearch, activeDialog, peerType, tg.service]);

  // ── Handlers ──────────────────────────────────────────────────

  async function handleSend() {
    if (!replyText.trim() || !activeDialog || sending || !peerType) return;
    setSending(true);
    setLastSentId(null);
    try {
      if (replyToMsg) {
        await tg.service.sendReply(peerType, activeDialog.telegramId, activeDialog.accessHash, replyText.trim(), replyToMsg.id);
        setReplyToMsg(null);
      } else {
        await sendMessage(replyText.trim());
      }
      setReplyText("");
      if (replyTextareaRef.current) replyTextareaRef.current.style.height = "auto";
      setLastSentId(Date.now());
      setTimeout(() => setLastSentId(null), 3000);
      refreshMessages();
    } finally {
      setSending(false);
    }
  }

  function handleEmojiSelect(emoji: string) {
    setReplyText((prev) => prev + emoji);
    replyTextareaRef.current?.focus();
  }

  async function handleForward(toDialog: TgDialog) {
    if (!forwardMsg || !activeDialog || !peerType) return;
    const toPeerType = toDialog.type === "private" ? "user" as const
      : toDialog.type === "group" || toDialog.type === "supergroup" ? "chat" as const : "channel" as const;
    try {
      await tg.service.forwardMessages(
        peerType, activeDialog.telegramId, activeDialog.accessHash,
        toPeerType, toDialog.telegramId, toDialog.accessHash,
        [forwardMsg.id]
      );
      setForwardMsg(null);
      setForwardSearch("");
    } catch (err) {
      console.error("[Telegram] Forward failed:", err);
    }
  }

  async function handleReaction(msgId: number, emoji: string) {
    if (!activeDialog || !peerType) return;
    try {
      await tg.service.sendReaction(peerType, activeDialog.telegramId, activeDialog.accessHash, msgId, emoji);
    } catch (err) {
      console.error("[Telegram] Reaction failed (may not be enabled for this chat):", err);
    }
  }

  function selectDialog(dialog: TgDialog) {
    setActiveDialog(dialog);
    setReplyText("");
    setReplyToMsg(null);
    setMsgSearchActive(false);
    setMsgSearch("");
    setSearchResults([]);
  }

  function togglePin(dialogId: string) {
    setPinnedChats((prev) => {
      const next = new Set(prev);
      if (next.has(dialogId)) next.delete(dialogId); else next.add(dialogId);
      return next;
    });
    setContextMenu(null);
  }

  function toggleMute(dialogId: string) {
    setMutedChats((prev) => {
      const next = new Set(prev);
      if (next.has(dialogId)) next.delete(dialogId); else next.add(dialogId);
      return next;
    });
    setContextMenu(null);
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    try {
      await fetch("/api/telegram/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      const res = await fetch("/api/telegram/groups");
      const d = await res.json();
      if (d.data) setFolders(d.data);
      setNewFolderName("");
      setShowNewFolder(false);
    } catch (err) {
      console.error("[Telegram] Failed to create folder:", err);
    }
  }

  // @mention detection
  function handleReplyTextChange(value: string) {
    setReplyText(value);
    const cursorPos = replyTextareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch && chatMembers.length > 0) {
      setMentionActive(true);
      setMentionQuery(mentionMatch[1].toLowerCase());
    } else {
      setMentionActive(false);
      setMentionQuery("");
    }
  }

  function insertMention(username: string) {
    const cursorPos = replyTextareaRef.current?.selectionStart ?? replyText.length;
    const textBeforeCursor = replyText.slice(0, cursorPos);
    const textAfterCursor = replyText.slice(cursorPos);
    const newBefore = textBeforeCursor.replace(/@\w*$/, `@${username} `);
    setReplyText(newBefore + textAfterCursor);
    setMentionActive(false);
    setMentionQuery("");
    replyTextareaRef.current?.focus();
  }

  const filteredMentions = React.useMemo(() => {
    if (!mentionActive) return [];
    return chatMembers
      .filter((m) => {
        if (!mentionQuery) return true;
        return (
          m.firstName.toLowerCase().includes(mentionQuery) ||
          (m.username?.toLowerCase().includes(mentionQuery) ?? false)
        );
      })
      .slice(0, 8);
  }, [mentionActive, mentionQuery, chatMembers]);

  // ── Filter + Sort Dialogs ─────────────────────────────────────

  const filtered = React.useMemo(() => {
    let result = dialogs;

    // Folder filter
    if (activeFolder) {
      const folder = folders.find((f) => f.id === activeFolder);
      if (folder) {
        const memberIds = new Set(folder.members.map((m) => m.telegram_chat_id));
        result = result.filter((d) => memberIds.has(d.telegramId));
      }
    }

    // Type/unread filter
    if (filter === "unread") result = result.filter((d) => d.unreadCount > 0);
    else if (filter === "private") result = result.filter((d) => d.type === "private");
    else if (filter === "group") result = result.filter((d) => d.type === "group" || d.type === "supergroup");
    else if (filter === "channel") result = result.filter((d) => d.type === "channel");

    // Text search — includes last message text
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.username?.toLowerCase().includes(q) ||
          d.lastMessage?.text?.toLowerCase().includes(q)
      );
    }

    // Sort: pinned first, then by last message date
    return result.sort((a, b) => {
      const aPinned = pinnedChats.has(a.id) ? 1 : 0;
      const bPinned = pinnedChats.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aDate = a.lastMessage?.date ?? 0;
      const bDate = b.lastMessage?.date ?? 0;
      return bDate - aDate;
    });
  }, [dialogs, filter, search, activeFolder, folders, pinnedChats]);

  const filterCounts = React.useMemo(() => {
    const counts = { all: dialogs.length, unread: 0, private: 0, group: 0, channel: 0 };
    for (const d of dialogs) {
      if (d.unreadCount > 0) counts.unread++;
      if (d.type === "private") counts.private++;
      else if (d.type === "group" || d.type === "supergroup") counts.group++;
      else if (d.type === "channel") counts.channel++;
    }
    return counts;
  }, [dialogs]);

  // Folder unread counts
  const folderUnreadCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const folder of folders) {
      const memberIds = new Set(folder.members.map((m) => m.telegram_chat_id));
      counts[folder.id] = dialogs.filter((d) => memberIds.has(d.telegramId) && d.unreadCount > 0).length;
    }
    return counts;
  }, [folders, dialogs]);

  function dialogIcon(type: string) {
    switch (type) {
      case "private": return <UserIcon className="h-4 w-4 text-muted-foreground" />;
      case "group": case "supergroup": return <Users className="h-4 w-4 text-muted-foreground" />;
      case "channel": return <Megaphone className="h-4 w-4 text-muted-foreground" />;
      default: return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
    }
  }

  // Close context menu on click outside
  React.useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  // ── Render helpers ────────────────────────────────────────────

  function renderMessage(msg: TgMessage) {
    const isOwn = msg.senderId === tg.telegramUserId;

    return (
      <div
        key={msg.id}
        className={cn("group relative", isOwn && "flex flex-col items-end")}
      >
        {/* Reply reference */}
        {msg.replyToId && (
          <div className="text-[10px] text-muted-foreground/50 mb-0.5 pl-3 border-l-2 border-primary/20">
            Reply to #{msg.replyToId}
          </div>
        )}

        <div className={cn(
          "max-w-[75%] rounded-xl px-3 py-2",
          isOwn
            ? "bg-primary/15 rounded-tr-sm"
            : "bg-white/[0.04] rounded-tl-sm"
        )}>
          {/* Sender + time */}
          <div className="flex items-baseline gap-2 mb-0.5">
            {!isOwn && (
              <span className="text-xs font-medium text-foreground">
                {msg.senderName || "Unknown"}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50">
              {new Date(msg.date * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Media */}
          {msg.mediaType && (
            <div className="flex items-center gap-1.5 mb-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              {msg.mediaType === "photo" ? (
                <Image className="h-4 w-4 text-blue-400" />
              ) : (
                <FileText className="h-4 w-4 text-amber-400" />
              )}
              <span className="text-xs text-muted-foreground">{msg.mediaType === "photo" ? "Photo" : "Document"}</span>
            </div>
          )}

          {/* Text with link detection */}
          <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words">
            {msg.text ? renderMessageText(msg.text) : (msg.mediaType ? null : "[empty]")}
          </p>
        </div>

        {/* Hover actions */}
        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 -mt-2 mr-1 bg-card border border-white/10 rounded-lg shadow-lg px-1 py-0.5 z-10">
          <button
            onClick={() => setReplyToMsg(msg)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10"
            title="Reply"
          >
            <Reply className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            onClick={() => { setForwardMsg(msg); setForwardSearch(""); }}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10"
            title="Forward"
          >
            <Forward className="h-3 w-3 text-muted-foreground" />
          </button>
          {/* Quick reactions */}
          {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReaction(msg.id, emoji)}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10 text-xs"
              title={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderMessageText(text: string): React.ReactNode {
    const parts = text.split(/(https?:\/\/[^\s<]+)/g);
    return parts.map((part, i) => {
      if (/^https?:\/\//.test(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }

  // Command palette filtered items
  const paletteItems = React.useMemo(() => {
    const items: { label: string; icon: React.ReactNode; action: () => void }[] = [];
    const q = paletteQuery.toLowerCase();

    // Jump to dialog
    for (const d of dialogs.slice(0, 20)) {
      if (q && !d.title.toLowerCase().includes(q)) continue;
      items.push({
        label: d.title,
        icon: dialogIcon(d.type),
        action: () => { selectDialog(d); setShowPalette(false); setPaletteQuery(""); },
      });
    }

    // Actions
    if (!q || "search messages".includes(q)) {
      items.push({
        label: "Search messages (Cmd+F)",
        icon: <Search className="h-4 w-4 text-muted-foreground" />,
        action: () => { setMsgSearchActive(true); setShowPalette(false); setPaletteQuery(""); },
      });
    }
    if (!q || "refresh".includes(q)) {
      items.push({
        label: "Refresh dialogs",
        icon: <RefreshCw className="h-4 w-4 text-muted-foreground" />,
        action: () => { refreshDialogs(); setShowPalette(false); setPaletteQuery(""); },
      });
    }

    return items.slice(0, 15);
  }, [paletteQuery, dialogs]);

  // ── Loading State ────────────────────────────────────────────

  if (tg.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not Connected CTA ───────────────────────────────────────

  if (tg.status !== "connected" && tg.status !== "reconnecting" && tg.status !== "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8 text-center">
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
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Connect Telegram</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              View your conversations, send messages, and manage contacts directly from SupraTeam.
            </p>
          </div>
          <Button
            size="lg"
            className="bg-[#2AABEE] hover:bg-[#2AABEE]/90 text-white font-medium px-8"
            onClick={() => router.push("/settings/integrations/connect")}
          >
            <Smartphone className="h-4 w-4 mr-2" />
            Connect Telegram
          </Button>
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 text-left space-y-3 max-w-md">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground">Zero-Knowledge Architecture</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your Telegram data is protected by <span className="text-foreground">zero-knowledge encryption</span>.
              All messages, contacts, and session data are encrypted with a key that exists only on your device.
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
          {tg.status === "needs-reauth" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-400">
                Your previous session used server-side encryption. Re-authenticate to upgrade.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Connected: 3-Column Layout ──────────────────────────────

  return (
    <div className="flex h-full overflow-hidden flex-col">
      {/* Connection status banner */}
      {(tg.status === "reconnecting" || tg.status === "error" || tg.error) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          {tg.status === "reconnecting" ? (
            <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-amber-400" />
          )}
          <span className="text-xs text-amber-400 flex-1">{tg.error || "Connection lost"}</span>
          <button onClick={() => tg.reconnect()} className="text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2">
            Reconnect now
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Column 1: Filter Sidebar + Folders */}
        <div className="w-[200px] shrink-0 border-r border-white/[0.06] flex flex-col">
          <div className="p-3 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chats</h2>
            <button
              onClick={() => setShowPalette(true)}
              className="flex h-5 items-center gap-1 rounded bg-white/[0.04] px-1.5 text-[9px] text-muted-foreground/60 hover:bg-white/[0.08]"
              title="Command palette (Cmd+K)"
            >
              <Command className="h-2.5 w-2.5" />K
            </button>
          </div>

          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {/* Type filters */}
            {([
              { key: "all" as FilterType, label: "All Chats", icon: MessageCircle },
              { key: "unread" as FilterType, label: "Unread", icon: Hash },
              { key: "private" as FilterType, label: "Direct Messages", icon: UserIcon },
              { key: "group" as FilterType, label: "Groups", icon: Users },
              { key: "channel" as FilterType, label: "Channels", icon: Megaphone },
            ] as const).map((item) => {
              const count = filterCounts[item.key];
              return (
                <button
                  key={item.key}
                  onClick={() => { setFilter(item.key); setActiveFolder(null); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    filter === item.key && !activeFolder
                      ? "bg-white/[0.08] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "text-[10px] shrink-0",
                      item.key === "unread" && count > 0 ? "text-primary font-medium" : "text-muted-foreground/60"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Folders */}
            {folders.length > 0 && (
              <div className="pt-2 mt-2 border-t border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium px-2.5 mb-1">Folders</p>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => { setActiveFolder(activeFolder === folder.id ? null : folder.id); setFilter("all"); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      activeFolder === folder.id
                        ? "bg-white/[0.08] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    )}
                  >
                    <Folder className="h-4 w-4 shrink-0" style={folder.color ? { color: folder.color } : undefined} />
                    <span className="flex-1 text-left truncate">
                      {folder.icon ? `${folder.icon} ` : ""}{folder.name}
                    </span>
                    {(folderUnreadCounts[folder.id] ?? 0) > 0 && (
                      <span className="text-[10px] text-primary font-medium shrink-0">
                        {folderUnreadCounts[folder.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* New folder */}
            {showNewFolder ? (
              <div className="flex items-center gap-1 px-1 mt-1">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
                  placeholder="Folder name"
                  className="flex-1 rounded bg-white/[0.04] border border-white/[0.08] px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                  autoFocus
                />
                <button onClick={createFolder} className="text-primary text-xs">Add</button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewFolder(true)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.04] transition-colors mt-1"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>New Folder</span>
              </button>
            )}
          </nav>

          {/* Connection info */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-2 w-2 rounded-full",
                tg.status === "connected" ? "bg-green-400" :
                tg.status === "reconnecting" ? "bg-amber-400 animate-pulse" :
                "bg-red-400"
              )} />
              <span className="text-[10px] text-muted-foreground truncate">
                {tg.status === "connected" ? "Connected" :
                 tg.status === "reconnecting" ? "Reconnecting..." : "Disconnected"}
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
              <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", dialogsLoading && "animate-spin")} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {dialogsLoading && dialogs.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {search ? "No conversations match your search" : "No conversations"}
                </p>
              </div>
            ) : (
              filtered.map((dialog) => (
                <button
                  key={dialog.id}
                  onClick={() => selectDialog(dialog)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, dialog }); }}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-3 text-left border-b border-white/[0.03] transition-colors",
                    activeDialog?.id === dialog.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium bg-white/[0.06] text-muted-foreground">
                    {dialog.type === "private" ? dialog.title.charAt(0).toUpperCase() : dialogIcon(dialog.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                        {pinnedChats.has(dialog.id) && <Pin className="h-3 w-3 text-primary/60 shrink-0" />}
                        {mutedChats.has(dialog.id) && <BellOff className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                        {dialog.title}
                      </span>
                      {dialog.lastMessage && (
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">
                          {timeAgo(new Date(dialog.lastMessage.date * 1000).toISOString())}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {dialog.lastMessage ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {dialog.lastMessage.senderName && (
                            <span className="text-foreground/60">{dialog.lastMessage.senderName}: </span>
                          )}
                          {dialog.lastMessage.text}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/40 italic">No messages</p>
                      )}
                      {dialog.unreadCount > 0 && (
                        <span className={cn(
                          "ml-auto shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium text-white",
                          mutedChats.has(dialog.id) ? "bg-muted-foreground/40" : "bg-primary"
                        )}>
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
                  {activeDialog.type === "private" ? activeDialog.title.charAt(0).toUpperCase() : dialogIcon(activeDialog.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">{activeDialog.title}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {activeDialog.type === "private" ? "Direct Message"
                      : activeDialog.type === "channel" ? "Channel" : "Group"}
                    {activeDialog.username && ` @${activeDialog.username}`}
                    {chatMembers.length > 0 && ` · ${chatMembers.length} members`}
                  </p>
                </div>
                <button
                  onClick={() => setMsgSearchActive(!msgSearchActive)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    msgSearchActive ? "bg-white/10 text-foreground" : "hover:bg-white/[0.06] text-muted-foreground"
                  )}
                  title="Search messages (Cmd+F)"
                >
                  <Search className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1 text-[9px] text-primary/50">
                  <Fingerprint className="h-3 w-3" />
                  E2E
                </div>
              </div>

              {/* Message search bar */}
              {msgSearchActive && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    value={msgSearch}
                    onChange={(e) => setMsgSearch(e.target.value)}
                    placeholder="Search in this conversation..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                    autoFocus
                  />
                  {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {searchResults.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{searchResults.length} results</span>
                  )}
                  <button onClick={() => { setMsgSearchActive(false); setMsgSearch(""); setSearchResults([]); }}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (msgSearchActive && searchResults.length > 0 ? searchResults : messages).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle className="h-8 w-8 text-muted-foreground/20 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {msgSearchActive && msgSearch ? "No messages match your search" : "No messages"}
                    </p>
                  </div>
                ) : (
                  (msgSearchActive && searchResults.length > 0 ? searchResults : messages).map(renderMessage)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply */}
              {activeDialog.type !== "channel" && (
                <div className="border-t border-white/[0.06] p-3">
                  {/* Delivery indicator */}
                  {lastSentId && (
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] text-green-400">
                      <Check className="h-3 w-3" />
                      <span>Message sent</span>
                    </div>
                  )}

                  {/* Reply-to banner */}
                  {replyToMsg && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                      <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] text-primary font-medium">{replyToMsg.senderName || "Unknown"}</span>
                        <p className="text-[10px] text-muted-foreground truncate">{replyToMsg.text?.slice(0, 80)}</p>
                      </div>
                      <button onClick={() => setReplyToMsg(null)}>
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}

                  {/* @mention autocomplete */}
                  {mentionActive && filteredMentions.length > 0 && (
                    <div className="mb-2 rounded-lg border border-white/10 bg-card shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
                      {filteredMentions.map((m) => (
                        <button
                          key={m.userId}
                          onClick={() => insertMention(m.username || m.firstName)}
                          className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="h-6 w-6 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] text-muted-foreground">
                            {m.firstName.charAt(0)}
                          </div>
                          <span className="text-xs text-foreground">{m.firstName} {m.lastName ?? ""}</span>
                          {m.username && <span className="text-[10px] text-muted-foreground">@{m.username}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <textarea
                      ref={replyTextareaRef}
                      value={replyText}
                      onChange={(e) => {
                        handleReplyTextChange(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={replyToMsg ? "Reply..." : "Type a message... (@ to mention)"}
                      rows={1}
                      className="flex-1 resize-none rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[38px] max-h-[120px]"
                    />
                    <EmojiPicker onSelect={handleEmojiSelect} />
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={!replyText.trim() || sending}
                      className="h-[38px] w-[38px] p-0"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <Send className="h-12 w-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">Select a conversation to read</p>
              <p className="text-xs text-muted-foreground/50 mt-1">All data stays in your browser — zero-knowledge encrypted</p>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
                <Command className="h-3 w-3" />
                <span>Press <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-muted-foreground/60">Cmd+K</kbd> to jump to a conversation</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Context Menu ──────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-card shadow-2xl shadow-black/50 py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => togglePin(contextMenu.dialog.id)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
          >
            <Pin className="h-3.5 w-3.5" />
            {pinnedChats.has(contextMenu.dialog.id) ? "Unpin" : "Pin conversation"}
          </button>
          <button
            onClick={() => toggleMute(contextMenu.dialog.id)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
          >
            <BellOff className="h-3.5 w-3.5" />
            {mutedChats.has(contextMenu.dialog.id) ? "Unmute" : "Mute conversation"}
          </button>
          <div className="border-t border-white/[0.06] my-1" />
          <button
            onClick={() => { selectDialog(contextMenu.dialog); setContextMenu(null); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Open conversation
          </button>
        </div>
      )}

      {/* ── Forward Dialog Picker ─────────────────────────────── */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setForwardMsg(null)}>
          <div className="w-[360px] max-h-[480px] rounded-xl border border-white/10 bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-medium text-foreground">Forward message to...</h3>
              <button onClick={() => setForwardMsg(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <Input
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Search conversations..."
                className="h-8 text-sm bg-white/[0.03] border-white/[0.06]"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {dialogs
                .filter((d) => d.id !== activeDialog?.id)
                .filter((d) => !forwardSearch || d.title.toLowerCase().includes(forwardSearch.toLowerCase()))
                .slice(0, 20)
                .map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleForward(d)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs text-muted-foreground">
                      {d.type === "private" ? d.title.charAt(0).toUpperCase() : dialogIcon(d.type)}
                    </div>
                    <span className="text-sm text-foreground truncate">{d.title}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Command Palette ────────────────────────────────────── */}
      {showPalette && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60" onClick={() => setShowPalette(false)}>
          <div className="w-[480px] max-h-[400px] rounded-xl border border-white/10 bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Jump to conversation or action..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                autoFocus
              />
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] text-muted-foreground/60">Esc</kbd>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {paletteItems.map((item, i) => (
                <button
                  key={i}
                  onClick={item.action}
                  className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors"
                >
                  {item.icon}
                  <span className="text-sm text-foreground truncate">{item.label}</span>
                </button>
              ))}
              {paletteItems.length === 0 && (
                <p className="text-xs text-muted-foreground/40 text-center py-8">No results</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
