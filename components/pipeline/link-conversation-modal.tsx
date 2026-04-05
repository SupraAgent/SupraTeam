"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTelegram } from "@/lib/client/telegram-context";
import type { DealLinkedChat, LinkedChatType } from "@/lib/types";
import type { TgDialog } from "@/lib/client/telegram-service";
import {
  Search, MessageCircle, Users, Megaphone, Link2, LinkIcon, Loader2, Star, StarOff, Unlink, AlertCircle,
} from "lucide-react";

interface LinkConversationModalProps {
  dealId: string;
  open: boolean;
  onClose: () => void;
  onLinksChanged: () => void;
}

/** Map GramJS dialog type to our LinkedChatType */
function mapDialogType(type: TgDialog["type"]): LinkedChatType {
  switch (type) {
    case "private": return "dm";
    case "group": return "group";
    case "supergroup": return "supergroup";
    case "channel": return "channel";
    default: return "group";
  }
}

function chatTypeIcon(type: LinkedChatType | TgDialog["type"]) {
  switch (type) {
    case "dm":
    case "private":
      return <MessageCircle className="h-3.5 w-3.5 text-blue-400" />;
    case "group":
      return <Users className="h-3.5 w-3.5 text-emerald-400" />;
    case "supergroup":
      return <Users className="h-3.5 w-3.5 text-purple-400" />;
    case "channel":
      return <Megaphone className="h-3.5 w-3.5 text-amber-400" />;
    default:
      return <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function LinkConversationModal({ dealId, open, onClose, onLinksChanged }: LinkConversationModalProps) {
  const { status: tgStatus, service } = useTelegram();
  const [dialogs, setDialogs] = React.useState<TgDialog[]>([]);
  const [linkedChats, setLinkedChats] = React.useState<DealLinkedChat[]>([]);
  const [loadingDialogs, setLoadingDialogs] = React.useState(false);
  const [loadingLinked, setLoadingLinked] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionInProgress, setActionInProgress] = React.useState<number | null>(null);

  // Fetch linked chats for this deal
  const fetchLinkedChats = React.useCallback(async () => {
    setLoadingLinked(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/linked-chats`);
      if (res.ok) {
        const json = await res.json();
        setLinkedChats(json.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoadingLinked(false);
    }
  }, [dealId]);

  // Fetch TG dialogs from browser-side GramJS
  const fetchDialogs = React.useCallback(async () => {
    if (tgStatus !== "connected") return;
    setLoadingDialogs(true);
    try {
      const result = await service.getDialogs(100);
      setDialogs(result);
    } catch {
      // silent
    } finally {
      setLoadingDialogs(false);
    }
  }, [tgStatus, service]);

  React.useEffect(() => {
    if (open) {
      fetchLinkedChats();
      fetchDialogs();
      setSearchQuery("");
    }
  }, [open, fetchLinkedChats, fetchDialogs]);

  const linkedChatIds = React.useMemo(
    () => new Set(linkedChats.map((c) => c.telegram_chat_id)),
    [linkedChats]
  );

  const filteredDialogs = React.useMemo(() => {
    if (!searchQuery.trim()) return dialogs;
    const q = searchQuery.toLowerCase();
    return dialogs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.username?.toLowerCase().includes(q)
    );
  }, [dialogs, searchQuery]);

  async function handleLink(dialog: TgDialog) {
    setActionInProgress(dialog.telegramId);
    try {
      const chatLink = dialog.username ? `https://t.me/${dialog.username}` : null;
      const res = await fetch(`/api/deals/${dealId}/linked-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: dialog.telegramId,
          chat_type: mapDialogType(dialog.type),
          chat_title: dialog.title,
          chat_link: chatLink,
          is_primary: linkedChats.length === 0,
        }),
      });
      if (res.ok) {
        await fetchLinkedChats();
        onLinksChanged();
      }
    } catch {
      // silent
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleUnlink(telegramChatId: number) {
    setActionInProgress(telegramChatId);
    try {
      const res = await fetch(
        `/api/deals/${dealId}/linked-chats?chat_id=${telegramChatId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await fetchLinkedChats();
        onLinksChanged();
      }
    } catch {
      // silent
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleTogglePrimary(telegramChatId: number, currentlyPrimary: boolean) {
    setActionInProgress(telegramChatId);
    try {
      const res = await fetch(`/api/deals/${dealId}/linked-chats`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: telegramChatId,
          is_primary: !currentlyPrimary,
        }),
      });
      if (res.ok) {
        await fetchLinkedChats();
        onLinksChanged();
      }
    } catch {
      // silent
    } finally {
      setActionInProgress(null);
    }
  }

  const isConnected = tgStatus === "connected";

  return (
    <Modal open={open} onClose={onClose} title="Link Telegram Conversations" className="max-w-md">
      {!isConnected ? (
        <div className="text-center py-8">
          <AlertCircle className="mx-auto h-8 w-8 text-amber-400/60" />
          <p className="mt-3 text-sm text-muted-foreground">
            Telegram session not connected
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Go to Settings &rarr; Integrations to connect your Telegram account, then come back to link conversations.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Currently linked chats */}
          {linkedChats.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Linked conversations</p>
              <div className="space-y-1">
                {linkedChats.map((chat) => (
                  <div
                    key={chat.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    {chatTypeIcon(chat.chat_type)}
                    <span className="flex-1 text-xs text-foreground truncate">
                      {chat.chat_title || `Chat ${chat.telegram_chat_id}`}
                    </span>
                    {chat.is_primary && (
                      <Badge className="text-[8px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">
                        primary
                      </Badge>
                    )}
                    <button
                      onClick={() => handleTogglePrimary(chat.telegram_chat_id, chat.is_primary)}
                      disabled={actionInProgress === chat.telegram_chat_id}
                      className={cn(
                        "p-1 rounded hover:bg-white/5 transition-colors",
                        chat.is_primary ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"
                      )}
                      title={chat.is_primary ? "Remove primary" : "Set as primary"}
                    >
                      {chat.is_primary ? <Star className="h-3 w-3" /> : <StarOff className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => handleUnlink(chat.telegram_chat_id)}
                      disabled={actionInProgress === chat.telegram_chat_id}
                      className="p-1 rounded hover:bg-red-500/10 text-muted-foreground/40 hover:text-red-400 transition-colors"
                      title="Unlink"
                    >
                      {actionInProgress === chat.telegram_chat_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Unlink className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="pl-8"
              autoFocus
            />
          </div>

          {/* Dialog list */}
          <div className="max-h-[320px] overflow-y-auto space-y-0.5 -mx-1 px-1">
            {(loadingDialogs || loadingLinked) && filteredDialogs.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" />
              </div>
            )}

            {!loadingDialogs && filteredDialogs.length === 0 && (
              <div className="text-center py-6">
                <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {searchQuery ? "No conversations match your search" : "No conversations found"}
                </p>
              </div>
            )}

            {filteredDialogs.map((dialog) => {
              const isLinked = linkedChatIds.has(dialog.telegramId);
              const isLoading = actionInProgress === dialog.telegramId;

              return (
                <button
                  key={dialog.id}
                  onClick={() => isLinked ? handleUnlink(dialog.telegramId) : handleLink(dialog)}
                  disabled={isLoading}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                    isLinked
                      ? "bg-primary/5 border border-primary/20 hover:bg-primary/10"
                      : "hover:bg-white/[0.04] border border-transparent"
                  )}
                >
                  {chatTypeIcon(dialog.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground truncate">
                        {dialog.title}
                      </span>
                      {dialog.username && (
                        <span className="text-[9px] text-muted-foreground/40 shrink-0">
                          @{dialog.username}
                        </span>
                      )}
                    </div>
                    {dialog.lastMessage && (
                      <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                        {dialog.lastMessage.senderName ? `${dialog.lastMessage.senderName}: ` : ""}
                        {dialog.lastMessage.text}
                      </p>
                    )}
                  </div>
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                  ) : isLinked ? (
                    <Badge className="text-[8px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30 shrink-0">
                      <LinkIcon className="h-2.5 w-2.5 mr-0.5" />
                      linked
                    </Badge>
                  ) : (
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
