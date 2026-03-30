"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Loader2, Unlink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CalendarConnection {
  id: string;
  google_email: string;
  is_active: boolean;
  connected_at: string;
  selected_calendars: string[];
  scopes?: string[];
}

const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

interface SyncState {
  connection_id: string;
  calendar_id: string;
  sync_status: string;
  last_full_sync_at: string | null;
  last_incremental_sync_at: string | null;
  error_message: string | null;
}

export function CalendarConnectCard() {
  const [connections, setConnections] = React.useState<CalendarConnection[]>([]);
  const [syncStates, setSyncStates] = React.useState<SyncState[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connecting, setConnecting] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null);

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/google/sync");
      if (res.ok) {
        const json = await res.json();
        setConnections(json.data?.connections ?? []);
        setSyncStates(json.data?.syncStates ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/calendar/google/connect", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Failed to start connection");
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      toast.error("Failed to connect Google Calendar");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/calendar/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const json = await res.json();
        toast.success(`Synced ${json.data?.eventCount ?? 0} events`);
        fetchStatus();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(connectionId);
    try {
      const res = await fetch(`/api/calendar/google/disconnect?connectionId=${connectionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Google Calendar disconnected");
        fetchStatus();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Disconnect failed");
      }
    } catch {
      toast.error("Disconnect failed");
    } finally {
      setDisconnecting(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/5 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-48 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {connections.map((conn) => {
        const syncState = syncStates.find((s) => s.connection_id === conn.id);
        const lastSync = syncState?.last_incremental_sync_at ?? syncState?.last_full_sync_at;
        const hasWriteScope = conn.scopes?.includes(WRITE_SCOPE) ?? false;

        return (
          <div
            key={conn.id}
            className="rounded-xl border border-white/10 bg-white/[0.035] p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Calendar className="h-5 w-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {conn.google_email}
                  </p>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    conn.is_active
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  )}>
                    {conn.is_active ? "Connected" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {syncState?.sync_status === "error"
                    ? <span className="text-red-400">Sync error: {syncState.error_message?.slice(0, 60)}</span>
                    : syncState?.sync_status === "syncing"
                      ? "Syncing..."
                      : lastSync
                        ? `Last synced ${new Date(lastSync).toLocaleString()}`
                        : "Not yet synced"
                  }
                </p>
                {conn.is_active && !hasWriteScope && (
                  <p className="text-[11px] text-amber-400 mt-0.5">
                    Calendar is read-only. Reconnect to enable event creation.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={handleSync}
                  disabled={syncing}
                  title="Sync now"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => handleDisconnect(conn.id)}
                  disabled={disconnecting === conn.id}
                  title="Disconnect"
                >
                  {disconnecting === conn.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Unlink className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Connect new button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] hover:border-white/20 transition-colors"
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Calendar className="h-4 w-4" />
        )}
        {connections.length === 0 ? "Connect Google Calendar" : "Add another calendar"}
      </button>
    </div>
  );
}
