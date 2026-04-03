/**
 * Hook for fetching participants of a Telegram group.
 * All data stays in the browser — never hits the server.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgGroupParticipant } from "./telegram-service";

interface UseTelegramGroupParticipantsResult {
  participants: TgGroupParticipant[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTelegramGroupParticipants(
  groupType: "group" | "supergroup" | null,
  groupId: number | null,
  accessHash?: string
): UseTelegramGroupParticipantsResult {
  const { service, status } = useTelegram();
  const [participants, setParticipants] = React.useState<TgGroupParticipant[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetch = React.useCallback(async () => {
    if (status !== "connected" || !groupType || !groupId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await service.getGroupParticipants(groupType, groupId, accessHash);
      setParticipants(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load participants");
    } finally {
      setLoading(false);
    }
  }, [service, status, groupType, groupId, accessHash]);

  React.useEffect(() => {
    if (status === "connected" && groupType && groupId) {
      fetch();
    } else {
      setParticipants([]);
    }
  }, [status, groupType, groupId, fetch]);

  return { participants, loading, error, refresh: fetch };
}
