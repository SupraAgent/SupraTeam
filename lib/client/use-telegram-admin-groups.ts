/**
 * Hook for fetching Telegram groups where the current user is admin.
 * All data stays in the browser — never hits the server.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgAdminGroup } from "./telegram-service";

interface UseTelegramAdminGroupsResult {
  groups: TgAdminGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTelegramAdminGroups(): UseTelegramAdminGroupsResult {
  const { service, status } = useTelegram();
  const [groups, setGroups] = React.useState<TgAdminGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetch = React.useCallback(async () => {
    if (status !== "connected") return;
    setLoading(true);
    setError(null);
    try {
      const result = await service.getAdminGroups();
      setGroups(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin groups");
    } finally {
      setLoading(false);
    }
  }, [service, status]);

  React.useEffect(() => {
    if (status === "connected") {
      fetch();
    }
  }, [status, fetch]);

  return { groups, loading, error, refresh: fetch };
}
