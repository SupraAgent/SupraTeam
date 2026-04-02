/**
 * Hook for fetching Telegram contacts client-side.
 * All data stays in the browser — never hits the server.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgContact } from "./telegram-service";

interface UseTelegramContactsResult {
  contacts: TgContact[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTelegramContacts(): UseTelegramContactsResult {
  const { service, status } = useTelegram();
  const [contacts, setContacts] = React.useState<TgContact[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetch = React.useCallback(async () => {
    if (status !== "connected") return;
    setLoading(true);
    setError(null);
    try {
      const result = await service.getContacts();
      setContacts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [service, status]);

  React.useEffect(() => {
    if (status === "connected") {
      fetch();
    }
  }, [status, fetch]);

  return { contacts, loading, error, refresh: fetch };
}
