"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegram } from "@/lib/client/telegram-context";
import { useTelegramDialogs } from "@/lib/client/use-telegram-dialogs";
import { useTelegramMessages } from "@/lib/client/use-telegram-messages";
import type { TgDialog, TgMessage, TgUserProfile, TgChatProfile } from "@/lib/client/telegram-service";
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
  CheckCheck,
  Forward,
  Pin,
  BellOff,
  X,
  Folder,
  FolderPlus,
  Image,
  FileText,
  Reply,
  Hash,
  Command,
  Pencil,
  Trash2,
  Download,
  Paperclip,
  ArrowUp,
  Info,
  AtSign,
  Phone,
  Clock,
  Shield,
  Bot,
  Globe,
  Mic,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { toast } from "sonner";

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

// Draft storage key
const DRAFTS_KEY = "tg_drafts";

function loadDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "{}"); }
  catch { return {}; }
}
function saveDraft(dialogId: string, text: string) {
  const drafts = loadDrafts();
  if (text.trim()) drafts[dialogId] = text;
  else delete drafts[dialogId];
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

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

  // Edit message
  const [editingMsg, setEditingMsg] = React.useState<TgMessage | null>(null);
  const [editText, setEditText] = React.useState("");

  // Context menu (conversation list)
  const [contextMenu, setContextMenu] = React.useState<ChatContextMenu | null>(null);

  // Message context menu
  const [msgContextMenu, setMsgContextMenu] = React.useState<{ x: number; y: number; msg: TgMessage } | null>(null);

  // Media preview — track blob URLs for cleanup
  const [mediaPreview, setMediaPreview] = React.useState<{ url: string; type: string } | null>(null);
  const [mediaLoading, setMediaLoading] = React.useState<number | null>(null);
  const mediaBlobUrlRef = React.useRef<string | null>(null);

  // File upload with preview
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [pendingFilePreview, setPendingFilePreview] = React.useState<string | null>(null);
  const [fileCaption, setFileCaption] = React.useState("");

  // Folders
  const [folders, setFolders] = React.useState<ChatFolder[]>([]);
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");

  // Online status (fetched for private chats)
  const [onlineStatus, setOnlineStatus] = React.useState<string | null>(null);

  // Contact profile sidebar
  const [showProfile, setShowProfile] = React.useState(false);
  const [profileData, setProfileData] = React.useState<TgUserProfile | TgChatProfile | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const profilePhotoUrlRef = React.useRef<string | null>(null);

  // Command palette
  const [showPalette, setShowPalette] = React.useState(false);
  const [paletteQuery, setPaletteQuery] = React.useState("");

  // Voice message playback
  const [playingVoice, setPlayingVoice] = React.useState<number | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const voiceBlobRef = React.useRef<string | null>(null);

  // @mention
  const [mentionActive, setMentionActive] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [chatMembers, setChatMembers] = React.useState<{ userId: number; firstName: string; lastName?: string; username?: string }[]>([]);

  // Pinned/muted state (local — persisted in localStorage)
  const [pinnedChats, setPinnedChats] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("tg_pinned") ?? "[]")); }
    catch { return new Set(); }
  });
  const [mutedChats, setMutedChats] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("tg_muted") ?? "[]")); }
    catch { return new Set(); }
  });

  // Persist pinned/muted
  React.useEffect(() => {
    localStorage.setItem("tg_pinned", JSON.stringify([...pinnedChats]));
  }, [pinnedChats]);
  React.useEffect(() => {
    localStorage.setItem("tg_muted", JSON.stringify([...mutedChats]));
  }, [mutedChats]);

  // Messages hook
  // Telegram API: supergroups are channels with megagroup=true, NOT chats
  const peerType = activeDialog
    ? activeDialog.type === "private"
      ? "user" as const
      : activeDialog.type === "group"
        ? "chat" as const
        : "channel" as const  // supergroup + channel both use InputPeerChannel
    : null;

  const {
    messages,
    loading: messagesLoading,
    sendMessage,
    refresh: refreshMessages,
    loadOlder,
    hasMore,
    typingUsers,
    sendTyping,
    outgoingReadMaxId,
    incomingReadMaxId,
  } = useTelegramMessages(
    peerType,
    activeDialog?.telegramId ?? null,
    activeDialog?.accessHash
  );

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages (only if near bottom)
  const prevMsgCountRef = React.useRef(0);
  React.useEffect(() => {
    if (messages.length > prevMsgCountRef.current && !msgSearchActive) {
      const container = messagesContainerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom || messages.length - prevMsgCountRef.current <= 2) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, msgSearchActive]);

  // Mark as read when opening a dialog — track last sent maxId to avoid redundant calls
  const lastReadMaxIdRef = React.useRef<number>(0);
  const maxMessageId = React.useMemo(() => {
    return messages.reduce((max, m) => (m.id > 0 && m.id > max ? m.id : max), 0);
  }, [messages]);

  React.useEffect(() => {
    if (!activeDialog || tg.status !== "connected" || !peerType || maxMessageId === 0) return;
    if (activeDialog.unreadCount > 0 && maxMessageId > lastReadMaxIdRef.current) {
      lastReadMaxIdRef.current = maxMessageId;
      tg.service.markAsRead(peerType, activeDialog.telegramId, activeDialog.accessHash, maxMessageId).catch(() => {});
    }
  }, [activeDialog, maxMessageId, tg.status, tg.service, peerType]);

  // Reset lastReadMaxId and scroll ref when switching dialogs
  React.useEffect(() => {
    lastReadMaxIdRef.current = 0;
    prevMsgCountRef.current = 0;
  }, [activeDialog?.id]);

  // Fetch folders
  React.useEffect(() => {
    fetch("/api/telegram/groups")
      .then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then((d) => { if (d.data) setFolders(d.data); })
      .catch(() => {});
  }, []);

  // Fetch online status for private chats
  React.useEffect(() => {
    setOnlineStatus(null);
    if (!activeDialog || tg.status !== "connected" || activeDialog.type !== "private") return;
    tg.service.getUserProfile(activeDialog.telegramId, activeDialog.accessHash)
      .then((profile) => {
        setOnlineStatus(profile.status);
      })
      .catch(() => {});
  }, [activeDialog?.id, activeDialog?.telegramId, activeDialog?.accessHash, activeDialog?.type, tg.status, tg.service]);

  // Fetch chat members when entering a group/supergroup
  React.useEffect(() => {
    if (!activeDialog || tg.status !== "connected") { setChatMembers([]); return; }
    if (activeDialog.type !== "group" && activeDialog.type !== "supergroup") { setChatMembers([]); return; }
    const pt = activeDialog.type === "group" ? "chat" as const : "channel" as const;
    tg.service.getChatMembers(pt, activeDialog.telegramId, activeDialog.accessHash)
      .then(setChatMembers)
      .catch(() => setChatMembers([]));
  }, [activeDialog, tg.status, tg.service]);

  // ── Infinite Scroll ──────────────────────────────────────────

  const scrollThrottleRef = React.useRef(false);
  const handleScroll = React.useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || !hasMore || scrollThrottleRef.current) return;
    if (container.scrollTop < 100) {
      scrollThrottleRef.current = true;
      const prevHeight = container.scrollHeight;
      loadOlder().then(() => {
        requestAnimationFrame(() => {
          const newHeight = container.scrollHeight;
          container.scrollTop = newHeight - prevHeight;
        });
      }).finally(() => {
        // Throttle: wait 500ms before allowing another load
        setTimeout(() => { scrollThrottleRef.current = false; }, 500);
      });
    }
  }, [hasMore, loadOlder]);

  // ── Keyboard Shortcuts ────────────────────────────────────────

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && activeDialog) {
        e.preventDefault();
        setMsgSearchActive(true);
      }
      if (e.key === "Escape") {
        if (editingMsg) { setEditingMsg(null); setEditText(""); }
        else if (showPalette) setShowPalette(false);
        else if (forwardMsg) setForwardMsg(null);
        else if (msgSearchActive) { setMsgSearchActive(false); setMsgSearch(""); setSearchResults([]); }
        else if (replyToMsg) setReplyToMsg(null);
        else if (contextMenu) setContextMenu(null);
        else if (msgContextMenu) setMsgContextMenu(null);
        else if (mediaPreview) setMediaPreview(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, showPalette, forwardMsg, msgSearchActive, replyToMsg, contextMenu, editingMsg, msgContextMenu, mediaPreview]);

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

  // ── Draft persistence ────────────────────────────────────────

  // Save draft on text change (debounced)
  React.useEffect(() => {
    if (!activeDialog) return;
    const timer = setTimeout(() => {
      saveDraft(activeDialog.id, replyText);
    }, 500);
    return () => clearTimeout(timer);
  }, [replyText, activeDialog]);

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
      saveDraft(activeDialog.id, "");
      if (replyTextareaRef.current) replyTextareaRef.current.style.height = "auto";
      setLastSentId(Date.now());
      setTimeout(() => setLastSentId(null), 3000);
    } catch (err) {
      toast.error("Failed to send message", { description: err instanceof Error ? err.message : undefined });
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
      : toDialog.type === "group" ? "chat" as const : "channel" as const; // supergroup + channel both use InputPeerChannel
    try {
      await tg.service.forwardMessages(
        peerType, activeDialog.telegramId, activeDialog.accessHash,
        toPeerType, toDialog.telegramId, toDialog.accessHash,
        [forwardMsg.id]
      );
      setForwardMsg(null);
      setForwardSearch("");
    } catch (err) {
      toast.error("Failed to forward message", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleReaction(msgId: number, emoji: string) {
    if (!activeDialog || !peerType) return;
    try {
      await tg.service.sendReaction(peerType, activeDialog.telegramId, activeDialog.accessHash, msgId, emoji);
    } catch (err) {
      toast.error("Failed to send reaction", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleEditSave() {
    if (!editingMsg || !editText.trim() || !activeDialog || !peerType) return;
    try {
      await tg.service.editMessage(peerType, activeDialog.telegramId, activeDialog.accessHash, editingMsg.id, editText.trim());
      setEditingMsg(null);
      setEditText("");
    } catch (err) {
      toast.error("Failed to edit message", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handlePin(msg: TgMessage) {
    if (!activeDialog || !peerType) return;
    try {
      if (msg.isPinned) {
        await tg.service.unpinMessage(peerType, activeDialog.telegramId, activeDialog.accessHash, msg.id);
      } else {
        await tg.service.pinMessage(peerType, activeDialog.telegramId, activeDialog.accessHash, msg.id, true);
      }
      refreshMessages();
    } catch (err) {
      toast.error(msg.isPinned ? "Failed to unpin message" : "Failed to pin message", { description: err instanceof Error ? err.message : undefined });
    }
    setMsgContextMenu(null);
  }

  async function handleDelete(msg: TgMessage) {
    if (!activeDialog || !peerType) return;
    try {
      await tg.service.deleteMessages(peerType, activeDialog.telegramId, activeDialog.accessHash, [msg.id]);
    } catch (err) {
      toast.error("Failed to delete message", { description: err instanceof Error ? err.message : undefined });
    }
    setMsgContextMenu(null);
  }

  async function handleMediaDownload(msg: TgMessage) {
    if (!activeDialog || !peerType || !msg.mediaType) return;
    // Stop any active voice playback
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (voiceBlobRef.current) { URL.revokeObjectURL(voiceBlobRef.current); voiceBlobRef.current = null; }
    setPlayingVoice(null);
    setMediaLoading(msg.id);
    try {
      const url = await tg.service.downloadMedia(peerType, activeDialog.telegramId, activeDialog.accessHash, msg.id);
      if (url) {
        // Revoke previous blob URL before setting new one
        if (mediaBlobUrlRef.current) URL.revokeObjectURL(mediaBlobUrlRef.current);
        mediaBlobUrlRef.current = url;
        setMediaPreview({ url, type: msg.mediaType });
      } else {
        toast.error("Media not available");
      }
    } catch (err) {
      toast.error("Failed to download media", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setMediaLoading(null);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeDialog) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum file size is 50 MB" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setPendingFile(file);
    setFileCaption("");
    // Create preview URL for images
    if (file.type.startsWith("image/")) {
      setPendingFilePreview(URL.createObjectURL(file));
    } else {
      setPendingFilePreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSend() {
    if (!pendingFile || !activeDialog || !peerType) return;
    setUploadingFile(true);
    try {
      await tg.service.sendFileSimple(peerType, activeDialog.telegramId, activeDialog.accessHash, pendingFile, fileCaption.trim() || undefined);
    } catch (err) {
      toast.error("Failed to upload file", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploadingFile(false);
      if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
      setPendingFile(null);
      setPendingFilePreview(null);
      setFileCaption("");
    }
  }

  async function handleVoicePlay(msg: TgMessage) {
    if (!activeDialog || !peerType) return;
    // If same voice is playing, pause it
    if (playingVoice === msg.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingVoice(null);
      return;
    }
    // Stop any existing playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (voiceBlobRef.current) {
      URL.revokeObjectURL(voiceBlobRef.current);
      voiceBlobRef.current = null;
    }
    setMediaLoading(msg.id);
    try {
      const url = await tg.service.downloadMedia(peerType, activeDialog.telegramId, activeDialog.accessHash, msg.id);
      if (!url) { toast.error("Voice message not available"); return; }
      voiceBlobRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingVoice(msg.id);
      audio.onended = () => setPlayingVoice(null);
      audio.onerror = () => { setPlayingVoice(null); toast.error("Failed to play voice message"); };
      await audio.play();
    } catch (err) {
      toast.error("Failed to play voice message", { description: err instanceof Error ? err.message : undefined });
      setPlayingVoice(null);
    } finally {
      setMediaLoading(null);
    }
  }

  function cancelFileUpload() {
    if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
    setPendingFile(null);
    setPendingFilePreview(null);
    setFileCaption("");
  }

  function selectDialog(dialog: TgDialog) {
    // Save current draft before switching
    if (activeDialog && replyText.trim()) {
      saveDraft(activeDialog.id, replyText);
    }
    // Clean up any open media blob
    if (mediaBlobUrlRef.current) {
      URL.revokeObjectURL(mediaBlobUrlRef.current);
      mediaBlobUrlRef.current = null;
    }
    setMediaPreview(null);
    setActiveDialog(dialog);
    // Restore draft for new dialog
    const drafts = loadDrafts();
    setReplyText(drafts[dialog.id] ?? "");
    setReplyToMsg(null);
    setEditingMsg(null);
    setEditText("");
    setMsgSearchActive(false);
    setMsgSearch("");
    setSearchResults([]);
  }

  async function openProfile() {
    if (!activeDialog || tg.status !== "connected") return;
    setShowProfile(true);
    setProfileLoading(true);
    try {
      // Clean up previous profile photo
      if (profilePhotoUrlRef.current) {
        URL.revokeObjectURL(profilePhotoUrlRef.current);
        profilePhotoUrlRef.current = null;
      }

      if (activeDialog.type === "private") {
        const profile = await tg.service.getUserProfile(activeDialog.telegramId, activeDialog.accessHash);
        if (profile.photoUrl) profilePhotoUrlRef.current = profile.photoUrl;
        setProfileData(profile);
      } else {
        const pt = activeDialog.type === "group" ? "chat" as const : "channel" as const;
        const profile = await tg.service.getChatProfile(pt, activeDialog.telegramId, activeDialog.accessHash);
        if (profile.photoUrl) profilePhotoUrlRef.current = profile.photoUrl;
        setProfileData(profile);
      }
    } catch (err) {
      toast.error("Failed to load profile", { description: err instanceof Error ? err.message : undefined });
      setShowProfile(false);
    } finally {
      setProfileLoading(false);
    }
  }

  // Clean up profile photo on dialog switch
  React.useEffect(() => {
    setShowProfile(false);
    setProfileData(null);
    if (profilePhotoUrlRef.current) {
      URL.revokeObjectURL(profilePhotoUrlRef.current);
      profilePhotoUrlRef.current = null;
    }
  }, [activeDialog?.id]);

  // Clean up blob URLs on component unmount
  React.useEffect(() => {
    return () => {
      if (profilePhotoUrlRef.current) URL.revokeObjectURL(profilePhotoUrlRef.current);
      if (mediaBlobUrlRef.current) URL.revokeObjectURL(mediaBlobUrlRef.current);
      if (voiceBlobRef.current) URL.revokeObjectURL(voiceBlobRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

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
      toast.error("Failed to create folder", { description: err instanceof Error ? err.message : undefined });
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
    // Send typing indicator
    sendTyping();
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

    // Text search
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

  const folderUnreadCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const folder of folders) {
      const memberIds = new Set(folder.members.map((m) => m.telegram_chat_id));
      counts[folder.id] = dialogs.filter((d) => memberIds.has(d.telegramId) && d.unreadCount > 0).length;
    }
    return counts;
  }, [folders, dialogs]);

  // Draft indicator for conversation list — only reload when dialog changes (not on every keystroke)
  const [draftRevision, setDraftRevision] = React.useState(0);
  const drafts = React.useMemo(() => loadDrafts(), [draftRevision]);
  // Bump revision when switching dialogs (draft is saved at that point)
  React.useEffect(() => { setDraftRevision((r) => r + 1); }, [activeDialog?.id]);

  function dialogIcon(type: string) {
    switch (type) {
      case "private": return <UserIcon className="h-4 w-4 text-muted-foreground" />;
      case "group": case "supergroup": return <Users className="h-4 w-4 text-muted-foreground" />;
      case "channel": return <Megaphone className="h-4 w-4 text-muted-foreground" />;
      default: return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
    }
  }

  // Close context menus on click outside
  React.useEffect(() => {
    if (!contextMenu && !msgContextMenu) return;
    const handleClick = () => { setContextMenu(null); setMsgContextMenu(null); };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu, msgContextMenu]);

  // ── Render helpers ────────────────────────────────────────────

  function renderMessage(msg: TgMessage) {
    const isOwn = msg.senderId === tg.telegramUserId || msg.id < 0; // negative id = optimistic
    const isOptimistic = msg.id < 0;
    // Delivery states: sending → sent → delivered → read
    const isRead = isOwn && msg.id > 0 && msg.id <= outgoingReadMaxId;
    const isSent = isOwn && msg.id > 0; // server confirmed

    return (
      <div
        key={msg.id}
        id={`msg-${msg.id}`}
        className={cn("group relative", isOwn && "flex flex-col items-end")}
      >
        {/* Pinned indicator */}
        {msg.isPinned && (
          <div className="flex items-center gap-1 mb-0.5 text-[10px] text-amber-400/60">
            <Pin className="h-2.5 w-2.5" />
            Pinned
          </div>
        )}

        {/* Reply reference */}
        {msg.replyToId && (
          <div className="text-[10px] text-muted-foreground/50 mb-0.5 pl-3 border-l-2 border-primary/20">
            Reply to #{msg.replyToId}
          </div>
        )}

        <div
          className={cn(
            "max-w-[75%] rounded-xl px-3 py-2",
            isOwn
              ? "bg-primary/15 rounded-tr-sm"
              : "bg-white/[0.04] rounded-tl-sm",
            isOptimistic && "opacity-60"
          )}
          onContextMenu={(e) => {
            if (msg.id > 0) {
              e.preventDefault();
              setMsgContextMenu({ x: e.clientX, y: e.clientY, msg });
            }
          }}
        >
          {/* Sender + time */}
          <div className="flex items-baseline gap-2 mb-0.5">
            {!isOwn && (
              <span className="text-xs font-medium text-foreground">
                {msg.senderName || "Unknown"}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50">
              {new Date(msg.date * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {msg.editDate && <span className="ml-1 italic">(edited)</span>}
            </span>
            {/* Delivery state for own messages */}
            {isOwn && (
              <span className="text-[10px] inline-flex items-center" title={isOptimistic ? "Sending..." : isRead ? "Read" : isSent ? "Sent" : undefined}>
                {isOptimistic ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50 inline" />
                ) : isRead ? (
                  <CheckCheck className="h-3 w-3 text-primary inline" />
                ) : isSent ? (
                  <Check className="h-3 w-3 text-muted-foreground/60 inline" />
                ) : null}
              </span>
            )}
          </div>

          {/* Media */}
          {msg.mediaType && (
            msg.mediaSubType === "voice" || msg.mediaSubType === "audio" ? (
              /* Voice / Audio inline player */
              <button
                onClick={() => handleVoicePlay(msg)}
                disabled={mediaLoading === msg.id}
                className="flex items-center gap-2 mb-1 px-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors cursor-pointer w-full"
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                  playingVoice === msg.id ? "bg-primary/20" : "bg-white/[0.06]"
                )}>
                  {mediaLoading === msg.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : playingVoice === msg.id ? (
                    <Pause className="h-4 w-4 text-primary" />
                  ) : (
                    <Play className="h-4 w-4 text-primary ml-0.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Waveform placeholder */}
                  <div className="flex items-center gap-[2px] h-4">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-[3px] rounded-full transition-colors",
                          playingVoice === msg.id ? "bg-primary/60" : "bg-white/20"
                        )}
                        style={{ height: `${4 + Math.sin(i * 0.7) * 6 + Math.random() * 4}px` }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground/50">
                    {msg.mediaDuration ? `${Math.floor(msg.mediaDuration / 60)}:${(msg.mediaDuration % 60).toString().padStart(2, "0")}` : "Voice message"}
                  </span>
                </div>
                <Volume2 className="h-3 w-3 text-muted-foreground/30 shrink-0" />
              </button>
            ) : (
              /* Photo / Document download button */
              <button
                onClick={() => handleMediaDownload(msg)}
                disabled={mediaLoading === msg.id}
                className="flex items-center gap-1.5 mb-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors cursor-pointer w-full"
              >
                {mediaLoading === msg.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : msg.mediaType === "photo" ? (
                  <Image className="h-4 w-4 text-blue-400" />
                ) : (
                  <FileText className="h-4 w-4 text-amber-400" />
                )}
                <span className="text-xs text-muted-foreground flex-1 text-left">
                  {msg.mediaType === "photo" ? "Photo" : msg.mediaSubType === "video_note" ? "Video message" : "Document"}
                </span>
                <Download className="h-3 w-3 text-muted-foreground/50" />
              </button>
            )
          )}

          {/* Text with link detection */}
          <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words">
            {msg.text ? renderMessageText(msg.text) : (msg.mediaType ? null : "[empty]")}
          </p>

          {/* Reactions */}
          {msg.reactions && msg.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {msg.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => handleReaction(msg.id, r.emoji)}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] px-2 py-0.5 text-xs transition-colors"
                >
                  <span>{r.emoji}</span>
                  <span className="text-[10px] text-muted-foreground">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hover actions */}
        {msg.id > 0 && (
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
            {isOwn && (
              <>
                <button
                  onClick={() => { setEditingMsg(msg); setEditText(msg.text); }}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10"
                  title="Edit"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleDelete(msg)}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3 text-red-400" />
                </button>
              </>
            )}
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
        )}
      </div>
    );
  }

  function renderMessageText(text: string): React.ReactNode {
    const parts = text.split(/(https?:\/\/[^\s<]+)/g);
    return parts.map((part, i) => {
      if (/^https?:\/\//.test(part)) {
        return (
          <a
            key={`${i}-${part.slice(0, 30)}`}
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

    for (const d of dialogs.slice(0, 20)) {
      if (q && !d.title.toLowerCase().includes(q)) continue;
      items.push({
        label: d.title,
        icon: dialogIcon(d.type),
        action: () => { selectDialog(d); setShowPalette(false); setPaletteQuery(""); },
      });
    }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {/* Column 1: Filter Sidebar + Folders — hidden on mobile */}
        <div className={cn(
          "w-[200px] shrink-0 border-r border-white/[0.06] flex flex-col",
          "max-lg:hidden"
        )}>
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

        {/* Column 2: Conversation List — full width on mobile when no dialog selected */}
        <div className={cn(
          "w-[320px] shrink-0 border-r border-white/[0.06] flex flex-col",
          "max-md:w-full",
          activeDialog && "max-md:hidden"
        )}>
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
                      {/* Show draft indicator */}
                      {drafts[dialog.id] && activeDialog?.id !== dialog.id ? (
                        <p className="text-xs truncate flex-1">
                          <span className="text-red-400">Draft: </span>
                          <span className="text-muted-foreground">{drafts[dialog.id]}</span>
                        </p>
                      ) : dialog.lastMessage ? (
                        <p className="text-xs text-muted-foreground truncate flex-1">
                          {dialog.lastMessage.senderName && (
                            <span className="text-foreground/60">{dialog.lastMessage.senderName}: </span>
                          )}
                          {dialog.lastMessage.text}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/40 italic flex-1">No messages</p>
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

        {/* Column 3: Message View + Profile Sidebar — full width on mobile when dialog selected */}
        <div className={cn(
          "flex-1 flex min-w-0",
          !activeDialog && "max-md:hidden"
        )}>
          <div className={cn("flex-1 flex flex-col min-w-0", showProfile && "border-r border-white/[0.06]")}>
          {activeDialog ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                <button
                  onClick={() => setActiveDialog(null)}
                  className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.06]"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium bg-white/[0.06] text-muted-foreground">
                  {activeDialog.type === "private" ? activeDialog.title.charAt(0).toUpperCase() : dialogIcon(activeDialog.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">{activeDialog.title}</h3>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                    {activeDialog.type === "private" && onlineStatus ? (
                      <>
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          onlineStatus === "online" ? "bg-green-400" :
                          onlineStatus === "recently" ? "bg-amber-400" :
                          "bg-muted-foreground/30"
                        )} />
                        <span className={onlineStatus === "online" ? "text-green-400" : undefined}>
                          {onlineStatus === "online" ? "Online" :
                           onlineStatus === "recently" ? "Recently online" :
                           onlineStatus === "within_week" ? "Last seen within a week" :
                           onlineStatus === "within_month" ? "Last seen within a month" :
                           "Offline"}
                        </span>
                      </>
                    ) : (
                      <span>
                        {activeDialog.type === "private" ? "Direct Message"
                          : activeDialog.type === "channel" ? "Channel" : "Group"}
                        {activeDialog.username && ` @${activeDialog.username}`}
                        {chatMembers.length > 0 && ` · ${chatMembers.length} members`}
                      </span>
                    )}
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
                <button
                  onClick={openProfile}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    showProfile ? "bg-white/10 text-foreground" : "hover:bg-white/[0.06] text-muted-foreground"
                  )}
                  title="Contact info"
                >
                  <Info className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1 text-[9px] text-primary/50" title="Zero-knowledge: session encrypted on-device, server never sees data">
                  <Fingerprint className="h-3 w-3" />
                  ZK
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

              {/* Pinned message banner */}
              {(() => {
                const pinned = [...messages].reverse().find((m) => m.isPinned);
                if (!pinned) return null;
                return (
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] bg-amber-500/5 shrink-0">
                    <Pin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <p className="text-xs text-foreground/70 truncate flex-1">
                      <span className="text-amber-400 font-medium">Pinned: </span>
                      {pinned.text?.slice(0, 100) || "[media]"}
                    </p>
                    <button
                      onClick={() => {
                        const el = document.getElementById(`msg-${pinned.id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="text-[10px] text-amber-400/70 hover:text-amber-400 shrink-0"
                    >
                      Jump
                    </button>
                  </div>
                );
              })()}

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {/* Load more indicator */}
                {hasMore && (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={() => loadOlder()}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    >
                      <ArrowUp className="h-3 w-3" />
                      Load older messages
                    </button>
                  </div>
                )}

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

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="px-4 py-1.5 border-t border-white/[0.03]">
                  <p className="text-[11px] text-primary/70 animate-pulse">
                    {typingUsers.length === 1
                      ? `${typingUsers[0]} is typing...`
                      : typingUsers.length === 2
                        ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
                        : `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`}
                  </p>
                </div>
              )}

              {/* Edit message inline */}
              {editingMsg && (
                <div className="border-t border-white/[0.06] p-3">
                  <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <Pencil className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-blue-400 font-medium">Editing message</span>
                      <p className="text-[10px] text-muted-foreground truncate">{editingMsg.text?.slice(0, 80)}</p>
                    </div>
                    <button onClick={() => { setEditingMsg(null); setEditText(""); }}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                        if (e.key === "Escape") { setEditingMsg(null); setEditText(""); }
                      }}
                      rows={1}
                      className="flex-1 resize-none rounded-lg bg-white/[0.03] border border-blue-500/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[38px] max-h-[120px]"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleEditSave} disabled={!editText.trim()} className="h-[38px] w-[38px] p-0">
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Reply / Compose (not when editing) */}
              {activeDialog.type !== "channel" && !editingMsg && (
                <div className="border-t border-white/[0.06] p-3">
                  {/* Delivery confirmation */}
                  {lastSentId && (
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] text-green-400/70 animate-in fade-in slide-in-from-bottom-1 duration-200">
                      <Check className="h-3 w-3" />
                      <span>Sent</span>
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
                    {/* File upload button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile}
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0"
                      title="Attach file"
                    >
                      {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

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

          {/* Contact Profile Sidebar */}
          {showProfile && activeDialog && (
            <div className="w-[300px] shrink-0 flex flex-col overflow-y-auto bg-card max-lg:hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-medium text-foreground">
                  {activeDialog.type === "private" ? "Contact Info" : "Chat Info"}
                </h3>
                <button
                  onClick={() => setShowProfile(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/[0.06]"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {profileLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : profileData ? (
                <div className="flex flex-col">
                  {/* Avatar + Name */}
                  <div className="flex flex-col items-center py-6 px-4">
                    {profileData.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profileData.photoUrl}
                        alt={activeDialog.title}
                        className="h-20 w-20 rounded-full object-cover border-2 border-white/10"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-primary/10 border-2 border-white/10 flex items-center justify-center text-2xl font-semibold text-primary">
                        {activeDialog.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <h4 className="text-base font-semibold text-foreground mt-3">
                      {"firstName" in profileData
                        ? [profileData.firstName, profileData.lastName].filter(Boolean).join(" ")
                        : profileData.title}
                    </h4>

                    {/* Online status for users */}
                    {"status" in profileData && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          profileData.status === "online" ? "bg-green-400" :
                          profileData.status === "recently" ? "bg-amber-400" :
                          "bg-muted-foreground/30"
                        )} />
                        <span className={cn(
                          "text-xs",
                          profileData.status === "online" ? "text-green-400" : "text-muted-foreground"
                        )}>
                          {profileData.status === "online" ? "Online" :
                           profileData.status === "recently" ? "Recently online" :
                           profileData.status === "within_week" ? "Within a week" :
                           profileData.status === "within_month" ? "Within a month" :
                           profileData.lastSeen > 0
                             ? `Last seen ${timeAgo(new Date(profileData.lastSeen * 1000).toISOString())}`
                             : "Offline"}
                        </span>
                      </div>
                    )}

                    {/* Members count for groups */}
                    {"membersCount" in profileData && profileData.membersCount > 0 && (
                      <span className="text-xs text-muted-foreground mt-1">
                        <Users className="h-3 w-3 inline mr-1" />
                        {profileData.membersCount.toLocaleString()} members
                      </span>
                    )}

                    {/* Bot / Verified badges */}
                    {"isBot" in profileData && (profileData.isBot || profileData.isVerified) && (
                      <div className="flex items-center gap-2 mt-2">
                        {profileData.isBot && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
                            <Bot className="h-3 w-3" /> Bot
                          </span>
                        )}
                        {profileData.isVerified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                            <Shield className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info rows */}
                  <div className="border-t border-white/[0.06] px-4 py-3 space-y-3">
                    {/* Bio / About */}
                    {(("bio" in profileData && profileData.bio) || ("about" in profileData && profileData.about)) && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">
                          {"bio" in profileData ? "Bio" : "About"}
                        </p>
                        <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                          {"bio" in profileData ? profileData.bio : ("about" in profileData ? profileData.about : "")}
                        </p>
                      </div>
                    )}

                    {/* Username */}
                    {(("username" in profileData && profileData.username)) && (
                      <div className="flex items-center gap-2.5">
                        <AtSign className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground/50">Username</p>
                          <p className="text-xs text-foreground">@{profileData.username}</p>
                        </div>
                      </div>
                    )}

                    {/* Phone (user only, last 4 digits) */}
                    {"phoneLast4" in profileData && profileData.phoneLast4 && (
                      <div className="flex items-center gap-2.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground/50">Phone</p>
                          <p className="text-xs text-foreground">***{profileData.phoneLast4}</p>
                        </div>
                      </div>
                    )}

                    {/* Last seen (user only) */}
                    {"lastSeen" in profileData && profileData.lastSeen > 0 && profileData.status !== "online" && (
                      <div className="flex items-center gap-2.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground/50">Last seen</p>
                          <p className="text-xs text-foreground">
                            {new Date(profileData.lastSeen * 1000).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Common chats (user only) */}
                    {"commonChatsCount" in profileData && profileData.commonChatsCount > 0 && (
                      <div className="flex items-center gap-2.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground/50">Common groups</p>
                          <p className="text-xs text-foreground">{profileData.commonChatsCount}</p>
                        </div>
                      </div>
                    )}

                    {/* Channel/group type */}
                    {"isChannel" in profileData && (
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground/50">Type</p>
                          <p className="text-xs text-foreground">
                            {profileData.isChannel ? "Channel" : profileData.isMegagroup ? "Supergroup" : "Group"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Encryption notice */}
                  <div className="border-t border-white/[0.06] px-4 py-3 mt-auto">
                    <div className="flex items-center gap-2 text-[10px] text-primary/50">
                      <Fingerprint className="h-3 w-3 shrink-0" />
                      <span>Profile loaded via zero-knowledge session</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ── Context Menu (Conversation List) ──────────────────── */}
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

      {/* ── Message Context Menu ─────────────────────────────── */}
      {msgContextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-card shadow-2xl shadow-black/50 py-1"
          style={{ left: msgContextMenu.x, top: msgContextMenu.y }}
        >
          <button
            onClick={() => { setReplyToMsg(msgContextMenu.msg); setMsgContextMenu(null); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </button>
          <button
            onClick={() => { setForwardMsg(msgContextMenu.msg); setForwardSearch(""); setMsgContextMenu(null); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
          >
            <Forward className="h-3.5 w-3.5" />
            Forward
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(msgContextMenu.msg.text).catch(() => {}); setMsgContextMenu(null); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
          >
            <FileText className="h-3.5 w-3.5" />
            Copy text
          </button>
          <button
            onClick={() => handlePin(msgContextMenu.msg)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
          >
            <Pin className="h-3.5 w-3.5" />
            {msgContextMenu.msg.isPinned ? "Unpin" : "Pin message"}
          </button>
          {(msgContextMenu.msg.senderId === tg.telegramUserId) && (
            <>
              <div className="border-t border-white/[0.06] my-1" />
              <button
                onClick={() => { setEditingMsg(msgContextMenu.msg); setEditText(msgContextMenu.msg.text); setMsgContextMenu(null); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-white/[0.06]"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => handleDelete(msgContextMenu.msg)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-white/[0.06]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          )}
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

      {/* ── File Upload Preview Modal ───────────────────────────── */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={cancelFileUpload}>
          <div className="w-[400px] rounded-xl border border-white/10 bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-medium text-foreground">Send file</h3>
              <button onClick={cancelFileUpload}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              {/* Preview */}
              {pendingFilePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pendingFilePreview} alt="Preview" className="max-h-[240px] rounded-lg object-contain mx-auto" />
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <FileText className="h-8 w-8 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{pendingFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(pendingFile.size / 1024).toFixed(0)} KB · {pendingFile.type || "Unknown type"}
                    </p>
                  </div>
                </div>
              )}
              {/* Caption input */}
              <textarea
                value={fileCaption}
                onChange={(e) => setFileCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFileSend(); }
                  if (e.key === "Escape") cancelFileUpload();
                }}
                placeholder="Add a caption..."
                rows={2}
                className="w-full resize-none rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.06]">
              <Button variant="ghost" size="sm" onClick={cancelFileUpload}>Cancel</Button>
              <Button size="sm" onClick={handleFileSend} disabled={uploadingFile}>
                {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Send
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Media Preview Modal ────────────────────────────────── */}
      {mediaPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }}>
          <div className="max-w-[90vw] max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }}
              className="absolute -top-10 right-0 text-white/60 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            {mediaPreview.type === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaPreview.url} alt="Media" className="max-w-full max-h-[85vh] rounded-lg" />
            ) : (
              <div className="bg-card rounded-xl border border-white/10 p-8 text-center">
                <FileText className="h-12 w-12 text-amber-400 mx-auto mb-3" />
                <p className="text-sm text-foreground mb-4">Document downloaded</p>
                <a
                  href={mediaPreview.url}
                  download
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  Save to disk
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
