"use client";

import * as React from "react";
import { EventList, type CalendarEventItem } from "@/components/calendar/event-list";
import { EventDetail } from "@/components/calendar/event-detail";
import { Calendar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function CalendarPanel() {
  const [events, setEvents] = React.useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(true);
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEventItem | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const fetchInProgress = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchEvents = React.useCallback((signal?: AbortSignal) => {
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;
    setLoading(true);

    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + 3);

    const params = new URLSearchParams({
      from: now.toISOString(),
      to: to.toISOString(),
    });

    fetch(`/api/calendar/google/events?${params}`, { signal })
      .then((r) => {
        if (r.status === 500) {
          setConnected(false);
          return { data: [] };
        }
        return r.json();
      })
      .then((json) => {
        if (signal?.aborted) return;
        if (json.error?.includes("No calendar connection")) {
          setConnected(false);
          return;
        }
        setEvents(json.data ?? []);
        setConnected(true);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!signal?.aborted) setConnected(false);
      })
      .finally(() => {
        fetchInProgress.current = false;
        if (!signal?.aborted) setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    fetchEvents(controller.signal);
    const interval = setInterval(() => fetchEvents(controller.signal), 5 * 60_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchEvents]);

  async function handleSync() {
    setSyncing(true);
    const controller = new AbortController();
    try {
      await fetch("/api/calendar/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      await new Promise((r) => setTimeout(r, 1000));
      fetchEvents(abortRef.current?.signal);
    } finally {
      setSyncing(false);
    }
  }

  if (!connected) {
    return (
      <div className="text-center py-6">
        <Calendar className="mx-auto h-8 w-8 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-foreground">Connect Calendar</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Link your Google Calendar to see upcoming events and meetings
        </p>
        <a
          href="/settings/integrations"
          className="inline-flex items-center gap-1.5 mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition"
        >
          <Calendar className="h-3.5 w-3.5" />
          Connect Google Calendar
        </a>
      </div>
    );
  }

  // Separate today vs upcoming
  const todayStr = new Date().toISOString().substring(0, 10);
  const todayEvents = events.filter((e) => {
    const eventDate = (e.start_at ?? e.start_date ?? "").substring(0, 10);
    return eventDate === todayStr;
  });
  const upcomingEvents = events.filter((e) => {
    const eventDate = (e.start_at ?? e.start_date ?? "").substring(0, 10);
    return eventDate > todayStr;
  });

  return (
    <div>
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
