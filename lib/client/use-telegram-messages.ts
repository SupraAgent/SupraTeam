/**
 * Hook for fetching and sending messages in a Telegram conversation.
 * Supports real-time updates, optimistic send, infinite scroll, and typing indicators.
 * All data stays in the browser — never hits the server.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgMessage, TgTypingEvent } from "./telegram-service";

interface UseTelegramMessagesResult {
  messages: TgMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  refresh: () => void;
  /** Load older messages (infinite scroll). Returns true if more exist. */
  loadOlder: () => Promise<boolean>;
  hasMore: boolean;
  /** Who is currently typing in this chat. */
  typingUsers: string[];
  /** Send typing indicator. Debounced — safe to call on every keystroke. */
  sendTyping: () => void;
  /** Outgoing read maxId — messages read by the other party. */
  outgoingReadMaxId: number;
  /** Incoming read maxId — messages delivered/read by us (used for delivery status). */
  incomingReadMaxId: number;
}

export function useTelegramMessages(
  peerType: "user" | "chat" | "channel" | null,
  peerId: number | null,
  accessHash?: string,
  limit = 50
): UseTelegramMessagesResult {
  const { service, status } = useTelegram();
  const [messages, setMessages] = React.useState<TgMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [outgoingReadMaxId, setOutgoingReadMaxId] = React.useState(0);
  const [incomingReadMaxId, setIncomingReadMaxId] = React.useState(0);
  const typingTimersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentRef = React.useRef(0);

  const isReconnectRef = React.useRef(false);

  const fetchMessages = React.useCallback(async () => {
    if (status !== "connected" || !peerType || !peerId) return;
    setLoading(true);
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
          // Also update any existing messages (edits that happened while offline)
          const updated = prev.map((existing) => {
            const fresh = fetched.find((f) => f.id === existing.id);
            return fresh ?? existing;
          });
          return [...updated, ...newMsgs];
        });
        isReconnectRef.current = false;
      } else {
        setMessages(fetched);
      }
      setHasMore(result.hasMore);
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
      // If previous status was reconnecting/error/disconnected, this is a reconnect
      const prev = prevStatusRef.current;
      if (prev === "reconnecting" || prev === "error" || prev === "disconnected") {
        isReconnectRef.current = true;
      }
      fetchMessages();
    } else if (status !== "connected") {
      // Don't clear messages during reconnect — preserve history
      if (status !== "reconnecting" && status !== "error") {
        setMessages([]);
        setHasMore(false);
      }
    }
    prevStatusRef.current = status;
  }, [status, peerType, peerId, fetchMessages]);

  // Subscribe to real-time events
  React.useEffect(() => {
    if (status !== "connected" || !peerId) return;

    const unsub = service.subscribe({
      onNewMessage(event) {
        if (event.chatId !== peerId) return;
        setMessages((prev) => {
          // Deduplicate by id
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        });
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

        // Auto-clear typing after 6s
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
      // Clear typing timers
      for (const timer of typingTimersRef.current.values()) clearTimeout(timer);
      typingTimersRef.current.clear();
      setTypingUsers([]);
    };
  }, [service, status, peerId]);

  // Reset read state on dialog change
  React.useEffect(() => {
    setOutgoingReadMaxId(0);
    setIncomingReadMaxId(0);
  }, [peerId]);

  const optimisticIdCounter = React.useRef(0);
  const sendMessage = React.useCallback(
    async (text: string) => {
      if (!peerType || !peerId) return;

      // Unique negative ID using counter (avoids Date.now() collisions)
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
        // Real-time event handler will add the confirmed message;
        // remove optimistic by its unique ID after a delay to avoid flicker
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
      // Read oldest ID from current state via callback
      let oldestId = 0;
      setMessages((prev) => {
        oldestId = prev.length > 0 && prev[0].id > 0 ? prev[0].id : 0;
        return prev; // no-op update
      });
      if (oldestId <= 0) return false;

      const result = await service.getMessagesPage(peerType, peerId, accessHash, limit, oldestId);
      const older = result.messages.reverse();
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const unique = older.filter((m) => !existingIds.has(m.id));
        return [...unique, ...prev];
      });
      setHasMore(result.hasMore);
      return result.hasMore;
    } catch {
      return false;
    } finally {
      loadingOlderRef.current = false;
    }
  }, [service, peerType, peerId, accessHash, limit, hasMore]);

  const sendTyping = React.useCallback(() => {
    if (!peerType || !peerId) return;
    const now = Date.now();
    // Throttle: don't send more than once every 4s
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
    typingUsers,
    sendTyping,
    outgoingReadMaxId,
    incomingReadMaxId,
  };
}
