/**
 * Hook for fetching Telegram dialogs (conversations) client-side.
 * All data stays in the browser — never hits the server.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgDialog } from "./telegram-service";

interface UseTelegramDialogsResult {
  dialogs: TgDialog[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTelegramDialogs(limit = 100): UseTelegramDialogsResult {
  const { service, status } = useTelegram();
  const [dialogs, setDialogs] = React.useState<TgDialog[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetch = React.useCallback(async () => {
    if (status !== "connected") return;
    setLoading(true);
    setError(null);
    try {
      const result = await service.getDialogs(limit);
      setDialogs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [service, status, limit]);

  // Auto-fetch when connected
  React.useEffect(() => {
    if (status === "connected") {
      fetch();
    }
  }, [status, fetch]);

  return { dialogs, loading, error, refresh: fetch };
}
