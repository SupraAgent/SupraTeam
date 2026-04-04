/**
 * Hook for fetching and sending messages in a Telegram conversation.
 * Supports real-time updates, optimistic send, infinite scroll, and typing indicators.
 * All data stays in the browser — never hits the server.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgMessage, TgTypingEvent } from "./telegram-service";

// ── Cross-dialog message cache ────────────────────────────────
// Persists messages across dialog switches so returning to a chat is instant.
const dialogCache = new Map<string, { messages: TgMessage[]; hasMore: boolean; totalCount: number }>();

function cacheKey(peerType: string, peerId: number): string {
  return `${peerType}:${peerId}`;
}

interface UseTelegramMessagesResult {
  messages: TgMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  refresh: () => void;
  /** Load older messages (infinite scroll). Returns true if more exist. */
  loadOlder: () => Promise<boolean>;
  hasMore: boolean;
  /** Total message count in the conversation (from API). */
  totalCount: number;
  /** Who is currently typing in this chat. */
  typingUsers: string[];
  /** Send typing indicator. Debounced — safe to call on every keystroke. */
  sendTyping: () => void;
  /** Outgoing read maxId — messages read by the other party. */
  outgoingReadMaxId: number;
  /** Incoming read maxId — messages delivered/read by us (used for delivery status). */
  incomingReadMaxId: number;
  /** Count of new messages received while user is scrolled up. */
  newMessageCount: number;
  /** Reset new message count (call when user scrolls to bottom). */
  clearNewMessageCount: () => void;
  /** Jump to a specific message by loading messages around it. */
  jumpToMessage: (messageId: number) => Promise<void>;
}

const DEFAULT_LIMIT = 30;

export function useTelegramMessages(
  peerType: "user" | "chat" | "channel" | null,
  peerId: number | null,
  accessHash?: string,
  limit = DEFAULT_LIMIT
): UseTelegramMessagesResult {
  const { service, status } = useTelegram();
  const [messages, setMessages] = React.useState<TgMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [totalCount, setTotalCount] = React.useState(0);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [outgoingReadMaxId, setOutgoingReadMaxId] = React.useState(0);
  const [incomingReadMaxId, setIncomingReadMaxId] = React.useState(0);
  const [newMessageCount, setNewMessageCount] = React.useState(0);
  const typingTimersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentRef = React.useRef(0);
  const atBottomRef = React.useRef(true);

  const isReconnectRef = React.useRef(false);

  // Track whether user is at bottom (set by VirtualMessageList)
  const setAtBottom = React.useCallback((val: boolean) => {
    atBottomRef.current = val;
    if (val) setNewMessageCount(0);
  }, []);

  const clearNewMessageCount = React.useCallback(() => {
    setNewMessageCount(0);
    atBottomRef.current = true;
  }, []);

  const fetchMessages = React.useCallback(async () => {
    if (status !== "connected" || !peerType || !peerId) return;

    // Try cache first for instant display
    const key = cacheKey(peerType, peerId);
    const cached = dialogCache.get(key);
    if (cached && !isReconnectRef.current) {
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      setTotalCount(cached.totalCount);
    }

    setLoading(!cached || isReconnectRef.current);
    setError(null);
    try {
      const result = await service.getMessagesPage(peerType, peerId, accessHash, limit);
      const fetched = result.messages.reverse(); // oldest first

      if (isReconnectRef.current) {
        // Merge: keep existing history + add any new messages from the latest page
        setMessages((prev) => {
          if (prev.length === 0) return fetched;
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = fetched.filter((m) => !existingIds.has(m.id));
          const updated = prev.map((existing) => {
            const fresh = fetched.find((f) => f.id === existing.id);
            return fresh ?? existing;
          });
          const merged = [...updated, ...newMsgs];
          dialogCache.set(key, { messages: merged, hasMore: result.hasMore, totalCount: result.totalCount });
          return merged;
        });
        isReconnectRef.current = false;
      } else {
        setMessages(fetched);
        dialogCache.set(key, { messages: fetched, hasMore: result.hasMore, totalCount: result.totalCount });
      }
      setHasMore(result.hasMore);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [service, status, peerType, peerId, accessHash, limit]);

  // Track previous status to detect reconnects
  const prevStatusRef = React.useRef(status);
  React.useEffect(() => {
    if (status === "connected" && peerType && peerId) {
      const prev = prevStatusRef.current;
      if (prev === "reconnecting" || prev === "error" || prev === "disconnected") {
        isReconnectRef.current = true;
      }
      fetchMessages();
    } else if (status !== "connected") {
      if (status !== "reconnecting" && status !== "error") {
        setMessages([]);
        setHasMore(false);
        setTotalCount(0);
      }
    }
    prevStatusRef.current = status;
  }, [status, peerType, peerId, fetchMessages]);

  // Reset new message count on dialog change
  React.useEffect(() => {
    setNewMessageCount(0);
  }, [peerId]);

  // Subscribe to real-time events
  React.useEffect(() => {
    if (status !== "connected" || !peerId || !peerType) return;

    const unsub = service.subscribe({
      onNewMessage(event) {
        if (event.chatId !== peerId) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message.id)) return prev;
          const updated = [...prev, event.message];
          // Update cache
          const key = cacheKey(peerType, peerId);
          const cached = dialogCache.get(key);
          if (cached) {
            dialogCache.set(key, { ...cached, messages: updated });
          }
          return updated;
        });
        // Track new messages when scrolled up
        if (!atBottomRef.current) {
          setNewMessageCount((c) => c + 1);
        }
      },
      onMessageEdit(event) {
        if (event.chatId !== peerId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, text: event.newText, editDate: event.editDate } : m
          )
        );
      },
      onMessageDelete(event) {
        if (event.chatId !== peerId) return;
        setMessages((prev) => prev.filter((m) => !event.messageIds.includes(m.id)));
      },
      onTyping(event) {
        if (event.chatId !== peerId) return;
        if (event.action === "cancel") {
          setTypingUsers((prev) => prev.filter((u) => u !== (event.userName || `User ${event.userId}`)));
          return;
        }
        const name = event.userName || `User ${event.userId}`;
        setTypingUsers((prev) => (prev.includes(name) ? prev : [...prev, name]));

        const existing = typingTimersRef.current.get(event.userId);
        if (existing) clearTimeout(existing);
        typingTimersRef.current.set(
          event.userId,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u !== name));
            typingTimersRef.current.delete(event.userId);
          }, 6000)
        );
      },
      onRead(event) {
        if (event.chatId !== peerId) return;
        if (event.outgoing) {
          setOutgoingReadMaxId((prev) => Math.max(prev, event.maxId));
        } else {
          setIncomingReadMaxId((prev) => Math.max(prev, event.maxId));
        }
      },
    });

    return () => {
      unsub();
      for (const timer of typingTimersRef.current.values()) clearTimeout(timer);
      typingTimersRef.current.clear();
      setTypingUsers([]);
    };
  }, [service, status, peerId, peerType]);

  // Reset read state on dialog change
  React.useEffect(() => {
    setOutgoingReadMaxId(0);
    setIncomingReadMaxId(0);
  }, [peerId]);

  const optimisticIdCounter = React.useRef(0);
  const sendMessage = React.useCallback(
    async (text: string) => {
      if (!peerType || !peerId) return;

      optimisticIdCounter.current -= 1;
      const optimisticId = optimisticIdCounter.current;

      const optimisticMsg: TgMessage = {
        id: optimisticId,
        text,
        date: Math.floor(Date.now() / 1000),
        senderId: undefined,
        senderName: undefined,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        await service.sendMessage(peerType, peerId, accessHash, text);
        setTimeout(() => {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }, 3000);
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        throw err;
      }
    },
    [service, peerType, peerId, accessHash]
  );

  const loadingOlderRef = React.useRef(false);
  const loadOlder = React.useCallback(async (): Promise<boolean> => {
    if (!peerType || !peerId || !hasMore || loadingOlderRef.current) return false;
    loadingOlderRef.current = true;
    try {
      let oldestId = 0;
      setMessages((prev) => {
        oldestId = prev.length > 0 && prev[0].id > 0 ? prev[0].id : 0;
        return prev;
      });
      if (oldestId <= 0) return false;

      const result = await service.getMessagesPage(peerType, peerId, accessHash, limit, oldestId);
      const older = result.messages.reverse();
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const unique = older.filter((m) => !existingIds.has(m.id));
        const updated = [...unique, ...prev];
        // Update cache
        const key = cacheKey(peerType, peerId);
        dialogCache.set(key, { messages: updated, hasMore: result.hasMore, totalCount: result.totalCount });
        return updated;
      });
      setHasMore(result.hasMore);
      if (result.totalCount > 0) setTotalCount(result.totalCount);
      return result.hasMore;
    } catch {
      return false;
    } finally {
      loadingOlderRef.current = false;
    }
  }, [service, peerType, peerId, accessHash, limit, hasMore]);

  // Jump to a specific message by loading messages around it
  const jumpToMessage = React.useCallback(async (messageId: number) => {
    if (!peerType || !peerId) return;
    try {
      const result = await service.getMessagesAround(peerType, peerId, accessHash, messageId, 50);
      const fetched = result.messages.reverse();

      // Merge with existing messages
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = fetched.filter((m) => !existingIds.has(m.id));
        // Merge and sort by id
        const merged = [...prev, ...newMsgs].sort((a, b) => a.id - b.id);
        return merged;
      });
      setHasMore(result.hasMore);
      if (result.totalCount > 0) setTotalCount(result.totalCount);
    } catch {
      // Silently fail — the message might already be loaded
    }
  }, [service, peerType, peerId, accessHash]);

  const sendTyping = React.useCallback(() => {
    if (!peerType || !peerId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 4000) return;
    lastTypingSentRef.current = now;
    service.sendTyping(peerType, peerId, accessHash).catch(() => {});
  }, [service, peerType, peerId, accessHash]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    refresh: fetchMessages,
    loadOlder,
    hasMore,
    totalCount,
    typingUsers,
    sendTyping,
    outgoingReadMaxId,
    incomingReadMaxId,
    newMessageCount,
    clearNewMessageCount,
    jumpToMessage,
  };
}
