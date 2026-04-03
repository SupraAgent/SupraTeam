/**
 * Hook for the "Group Nuke" operation — kicks a user from all groups
 * where the current user is admin.
 * All operations run client-side via GramJS.
 */

"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import type { TgAdminGroup } from "./telegram-service";

export interface NukeGroupResult {
  groupName: string;
  success: boolean;
  error?: string;
}

export interface NukeGroupsState {
  status: "idle" | "running" | "done" | "error" | "cancelled";
  results: NukeGroupResult[];
  processed: number;
  total: number;
  currentGroup: string;
  error: string | null;
}

const INITIAL_STATE: NukeGroupsState = {
  status: "idle",
  results: [],
  processed: 0,
  total: 0,
  currentGroup: "",
  error: null,
};

export function useNukeGroups() {
  const { service, status: tgStatus } = useTelegram();
  const [state, setState] = React.useState<NukeGroupsState>(INITIAL_STATE);
  const cancelledRef = React.useRef(false);

  const reset = React.useCallback(() => {
    setState(INITIAL_STATE);
    cancelledRef.current = false;
  }, []);

  const cancel = React.useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const start = React.useCallback(
    async (
      userId: number,
      userAccessHash: string | undefined,
      adminGroups: TgAdminGroup[]
    ) => {
      if (tgStatus !== "connected") return;
      cancelledRef.current = false;

      setState({
        status: "running",
        results: [],
        processed: 0,
        total: adminGroups.length,
        currentGroup: "",
        error: null,
      });

      try {
        for (const group of adminGroups) {
          if (cancelledRef.current) break;

          setState((s) => ({ ...s, currentGroup: group.title }));

          try {
            await service.kickGroupMember(
              group.type,
              group.telegramId,
              group.accessHash,
              userId,
              userAccessHash
            );

            setState((s) => ({
              ...s,
              processed: s.processed + 1,
              results: [...s.results, { groupName: group.title, success: true }],
            }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";

            // Handle flood wait
            const floodMatch = msg.match(/FLOOD_WAIT_(\d+)/i);
            if (floodMatch) {
              const wait = parseInt(floodMatch[1], 10);
              setState((s) => ({ ...s, currentGroup: `Rate limited, waiting ${wait}s...` }));
              await new Promise((r) => setTimeout(r, wait * 1000));
              // Retry
              try {
                await service.kickGroupMember(
                  group.type,
                  group.telegramId,
                  group.accessHash,
                  userId,
                  userAccessHash
                );
                setState((s) => ({
                  ...s,
                  processed: s.processed + 1,
                  results: [...s.results, { groupName: group.title, success: true }],
                }));
              } catch (retryErr) {
                setState((s) => ({
                  ...s,
                  processed: s.processed + 1,
                  results: [
                    ...s.results,
                    { groupName: group.title, success: false, error: retryErr instanceof Error ? retryErr.message : "Failed" },
                  ],
                }));
              }
              continue;
            }

            setState((s) => ({
              ...s,
              processed: s.processed + 1,
              results: [...s.results, { groupName: group.title, success: false, error: msg }],
            }));
          }
        }

        setState((s) => ({
          ...s,
          status: cancelledRef.current ? "cancelled" : "done",
          currentGroup: "",
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          error: err instanceof Error ? err.message : "An error occurred",
        }));
      }
    },
    [service, tgStatus]
  );

  return { state, start, cancel, reset };
}
