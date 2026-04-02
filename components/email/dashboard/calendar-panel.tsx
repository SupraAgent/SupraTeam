"use client";

import * as React from "react";
import { EventList, type CalendarEventItem } from "@/components/calendar/event-list";
import { EventDetail } from "@/components/calendar/event-detail";
import { Calendar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function CalendarPanel() {
  const [events, setEvents] = React.useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEventItem | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const mountedRef = React.useRef(true);

  const fetchEvents = React.useCallback(() => {
    if (!mountedRef.current) return;
    // Abort any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + 3);

    const params = new URLSearchParams({
      from: now.toISOString(),
      to: to.toISOString(),
    });

    fetch(`/api/calendar/google/events?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) return r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        return r.json();
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (json.error?.includes("No calendar connection")) {
          setConnected(false);
          return;
        }
        if (json.error) {
          setEvents([]);
          return;
        }
        setEvents(json.data ?? []);
        setConnected(true);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    fetchEvents();
    const interval = setInterval(fetchEvents, 5 * 60_000);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(interval);
    };
  }, [fetchEvents]);

  async function handleSync() {
    if (!mountedRef.current) return;
    setSyncing(true);
    try {
      await fetch("/api/calendar/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Brief delay for sync to process, then refetch
      await new Promise((r) => setTimeout(r, 1000));
      if (mountedRef.current) fetchEvents();
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  }

  async function handleConnect() {
    try {
      const res = await fetch("/api/calendar/google/connect", { method: "POST" });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      }
    } catch {
      // Fallback to settings page
      window.location.href = "/settings/integrations/calendar";
    }
  }

  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 min-h-[280px]">
        <div className="rounded-2xl bg-white/[0.04] p-5 mb-4">
          <Calendar className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-semibold text-foreground">Connect Google Calendar</p>
        <p className="mt-1.5 text-xs text-muted-foreground max-w-[240px] leading-relaxed">
          Link your Google Calendar to see upcoming events, meetings, and schedule directly from your inbox
        </p>
        <button
          onClick={handleConnect}
          className="inline-flex items-center gap-2 mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition shadow-lg shadow-primary/20"
        >
          <Calendar className="h-4 w-4" />
          Connect Calendar
        </button>
      </div>
    );
  }

  // Separate today vs upcoming (use local date, not UTC)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayEvents = events.filter((e) => {
    const eventDate = (e.start_at ?? e.start_date ?? "").substring(0, 10);
    return eventDate === todayStr;
  });
  const upcomingEvents = events.filter((e) => {
    const eventDate = (e.start_at ?? e.start_date ?? "").substring(0, 10);
    return eventDate > todayStr;
  });

  return (
    <div className="min-h-[280px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Today ({todayEvents.length})
        </span>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Sync now"
        >
          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
        </button>
      </div>

      <EventList
        events={todayEvents}
        loading={loading}
        onEventClick={setSelectedEvent}
        compact
      />

      {upcomingEvents.length > 0 && (
        <>
          <div className="mt-4 mb-2">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Upcoming ({upcomingEvents.length})
            </span>
          </div>
          <EventList
            events={upcomingEvents.slice(0, 5)}
            onEventClick={setSelectedEvent}
            compact
          />
        </>
      )}

      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
