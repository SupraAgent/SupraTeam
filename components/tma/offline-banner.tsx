"use client";

import * as React from "react";
import { WifiOff, RefreshCw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineStatus, syncOfflineActions } from "@/lib/client/tma-offline";
import { hapticNotification } from "@/components/tma/haptic";

export function OfflineBanner() {
  const { isOnline, pendingActions } = useOfflineStatus();
  const [visible, setVisible] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [justReconnected, setJustReconnected] = React.useState(false);
  const [lastSyncTime, setLastSyncTime] = React.useState<number | null>(null);
  const prevOnlineRef = React.useRef(isOnline);

  // Track online/offline transitions
  React.useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (!isOnline) {
      // Went offline
      setVisible(true);
      setJustReconnected(false);
      hapticNotification("warning");
    } else if (!wasOnline && isOnline) {
      // Came back online
      setJustReconnected(true);
      hapticNotification("success");

      // Sync pending actions
      setSyncing(true);
      syncOfflineActions()
        .then(() => {
          setLastSyncTime(Date.now());
        })
        .finally(() => {
          setSyncing(false);
        });

      // Auto-dismiss after 3 seconds
      const timer = setTimeout(() => {
        setVisible(false);
        setJustReconnected(false);
      }, 3_000);

      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!visible && isOnline) return null;

  const formattedTime = lastSyncTime
    ? new Date(lastSyncTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={cn(
        "px-3 py-2 text-xs font-medium flex items-center gap-2 transition-colors duration-300",
        justReconnected
          ? "bg-emerald-500/15 text-emerald-400 border-b border-emerald-500/20"
          : "bg-amber-500/15 text-amber-400 border-b border-amber-500/20"
      )}
    >
      {justReconnected ? (
        <>
          {syncing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            {syncing ? "Back online! Syncing..." : "Back online! All synced."}
          </span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            You&apos;re offline. Showing cached data.
            {formattedTime && (
              <span className="text-amber-400/60 ml-1">
                Last sync: {formattedTime}
              </span>
            )}
          </span>
          {pendingActions > 0 && (
            <span className="bg-amber-500/20 text-amber-300 rounded-full px-2 py-0.5 text-[10px] shrink-0">
              {pendingActions} pending
            </span>
          )}
        </>
      )}
    </div>
  );
}
