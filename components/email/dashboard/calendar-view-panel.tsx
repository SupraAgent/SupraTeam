"use client";

import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEventItem } from "@/components/calendar/event-list";
import { EventDetail } from "@/components/calendar/event-detail";

type ViewMode = "month" | "week";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarViewPanel() {
  const [view, setView] = React.useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [events, setEvents] = React.useState<CalendarEventItem[]>([]);
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEventItem | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Compute date range based on view
  const { rangeStart, rangeEnd } = React.useMemo(() => {
    if (view === "week") {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { rangeStart: start, rangeEnd: end };
    }
    // Month view — include partial weeks
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    end.setDate(end.getDate() + (6 - end.getDay()) + 1);
    return { rangeStart: start, rangeEnd: end };
  }, [currentDate, view]);

  // Fetch events for visible range
  React.useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const params = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
    });

    fetch(`/api/calendar/google/events?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) {
          return r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        }
        return r.json();
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (json.error?.includes("No calendar connection")) {
          setConnected(false);
          return;
        }
        if (json.error) {
          // Server error but calendar is connected — don't show connect CTA
          setEvents([]);
          return;
        }
        setEvents(json.data ?? []);
        setConnected(true);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Network error — don't assume disconnected
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [rangeStart, rangeEnd]);

  function navigate(dir: -1 | 1) {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (view === "month") {
        next.setMonth(next.getMonth() + dir);
      } else {
        next.setDate(next.getDate() + dir * 7);
      }
      return next;
    });
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  async function handleConnect() {
    try {
      const res = await fetch("/api/calendar/google/connect", { method: "POST" });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } catch {
      window.location.href = "/settings/integrations/calendar";
    }
  }

  if (connected === false) {
    return (
      <div className="text-center py-6">
        <Calendar className="mx-auto h-8 w-8 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-foreground">Connect Calendar</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Link your Google Calendar to see your schedule
        </p>
        <button
          onClick={handleConnect}
          className="inline-flex items-center gap-1.5 mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition"
        >
          <Calendar className="h-3.5 w-3.5" />
          Connect Google Calendar
        </button>
      </div>
    );
  }

  // Group events by local date string (memoized)
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const ev of events) {
      const dateStr = (ev.start_at ?? ev.start_date ?? "").substring(0, 10);
      if (!dateStr) continue;
      const existing = map.get(dateStr) ?? [];
      existing.push(ev);
      map.set(dateStr, existing);
    }
    return map;
  }, [events]);

  const todayStr = toDateStr(new Date());

  const title = React.useMemo(() => {
    if (view === "month") {
      return currentDate.toLocaleString("en-US", { month: "long", year: "numeric" });
    }
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleString("en-US", { month: "short", day: "numeric" });
    return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
  }, [currentDate, view]);

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate(-1)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-medium text-foreground min-w-[140px] text-center">
            {title}
          </span>
          <button
            onClick={() => navigate(1)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={goToday}
            className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/10 transition"
          >
            Today
          </button>
        </div>
        <div className="flex rounded-md border border-white/10 overflow-hidden">
          <button
            onClick={() => setView("month")}
            className={cn(
              "px-2 py-1 text-[10px] font-medium transition-colors",
              view === "month"
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            Month
          </button>
          <button
            onClick={() => setView("week")}
            className={cn(
              "px-2 py-1 text-[10px] font-medium transition-colors",
              view === "week"
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            Week
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {view === "month" ? (
        <MonthGrid
          rangeStart={rangeStart}
          currentMonth={currentDate.getMonth()}
          currentYear={currentDate.getFullYear()}
          todayStr={todayStr}
          eventsByDate={eventsByDate}
          onEventClick={setSelectedEvent}
        />
      ) : (
        <WeekGrid
          rangeStart={rangeStart}
          todayStr={todayStr}
          eventsByDate={eventsByDate}
          loading={loading}
          onEventClick={setSelectedEvent}
        />
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

// ── Month Grid ────────────────────────────────────────────

function MonthGrid({
  rangeStart,
  currentMonth,
  currentYear,
  todayStr,
  eventsByDate,
  onEventClick,
}: {
  rangeStart: Date;
  currentMonth: number;
  currentYear: number;
  todayStr: string;
  eventsByDate: Map<string, CalendarEventItem[]>;
  onEventClick: (e: CalendarEventItem) => void;
}) {
  const weeks: Date[][] = [];
  const d = new Date(rangeStart);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  while (weeks.length < 6) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
    if (week[6] >= lastDay) break;
  }

  return (
    <div className="space-y-px">
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day) => {
            const dateStr = toDateStr(day);
            const isToday = dateStr === todayStr;
            const isCurrentMonth = day.getMonth() === currentMonth;
            const dayEvents = eventsByDate.get(dateStr) ?? [];

            return (
              <div
                key={dateStr}
                className={cn(
                  "min-h-[52px] p-0.5 border border-white/[0.04]",
                  !isCurrentMonth && "opacity-40"
                )}
              >
                <div
                  className={cn(
                    "text-[10px] text-center leading-5",
                    isToday
                      ? "bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center mx-auto"
                      : "text-muted-foreground"
                  )}
                >
                  {day.getDate()}
                </div>
                {dayEvents.slice(0, 2).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    className="w-full text-left rounded px-1 py-px text-[9px] truncate bg-primary/15 text-primary hover:bg-primary/25 transition-colors mt-px"
                    title={ev.summary}
                  >
                    {ev.summary}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <p className="text-[8px] text-muted-foreground text-center mt-px">
                    +{dayEvents.length - 2} more
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Week Grid ─────────────────────────────────────────────

function WeekGrid({
  rangeStart,
  todayStr,
  eventsByDate,
  loading,
  onEventClick,
}: {
  rangeStart: Date;
  todayStr: string;
  eventsByDate: Map<string, CalendarEventItem[]>;
  loading: boolean;
  onEventClick: (e: CalendarEventItem) => void;
}) {
  const days: Date[] = [];
  const d = new Date(rangeStart);
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  return (
    <div className="grid grid-cols-7 gap-px">
      {days.map((day) => {
        const dateStr = toDateStr(day);
        const isToday = dateStr === todayStr;
        const dayEvents = eventsByDate.get(dateStr) ?? [];

        return (
          <div
            key={dateStr}
            className="min-h-[120px] p-1 border border-white/[0.04] rounded"
          >
            <div
              className={cn(
                "text-[10px] text-center leading-5 mb-1",
                isToday
                  ? "bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center mx-auto"
                  : "text-muted-foreground"
              )}
            >
              {day.getDate()}
            </div>
            <div className="space-y-0.5">
              {dayEvents.map((ev) => {
                const startTime = ev.start_at
                  ? new Date(ev.start_at).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "All day";
                return (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    className="w-full text-left rounded px-1 py-0.5 bg-primary/15 hover:bg-primary/25 transition-colors"
                    title={ev.summary}
                  >
                    <p className="text-[9px] text-primary truncate">{ev.summary}</p>
                    <p className="text-[8px] text-muted-foreground">{startTime}</p>
                  </button>
                );
              })}
              {dayEvents.length === 0 && !loading && (
                <p className="text-[8px] text-muted-foreground/30 text-center pt-2">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
