/**
 * Hook for fetching and sending messages in a Telegram conversation.
 * All data stays in the browser — never hits the server.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgMessage } from "./telegram-service";

interface UseTelegramMessagesResult {
  messages: TgMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  refresh: () => void;
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

  const fetch = React.useCallback(async () => {
    if (status !== "connected" || !peerType || !peerId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await service.getMessages(peerType, peerId, accessHash, limit);
      setMessages(result.reverse()); // oldest first
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [service, status, peerType, peerId, accessHash, limit]);

  React.useEffect(() => {
    if (status === "connected" && peerType && peerId) {
      fetch();
    } else {
      setMessages([]);
    }
  }, [status, peerType, peerId, fetch]);

  const sendMessage = React.useCallback(
    async (text: string) => {
      if (!peerType || !peerId) return;
      await service.sendMessage(peerType, peerId, accessHash, text);
      // Refresh messages after sending
      await fetch();
    },
    [service, peerType, peerId, accessHash, fetch]
  );

  return { messages, loading, error, sendMessage, refresh: fetch };
}
