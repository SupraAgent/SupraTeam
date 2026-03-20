"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  id: string;
  type: "close_date" | "stage_change" | "reminder" | "broadcast";
  date: string;
  title: string;
  subtitle?: string;
  color: string;
  meta?: Record<string, unknown>;
};

type ViewMode = "month" | "week";

const TYPE_LABELS: Record<string, string> = {
  close_date: "Close Date",
  stage_change: "Stage Change",
  reminder: "Reminder",
  broadcast: "Broadcast",
};

const TYPE_ICONS: Record<string, string> = {
  close_date: "$",
  stage_change: "→",
  reminder: "!",
  broadcast: "📢",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date) {
  return d.toISOString().substring(0, 10);
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<ViewMode>("month");
  const [filterTypes, setFilterTypes] = React.useState<Set<string>>(
    new Set(["close_date", "stage_change", "reminder", "broadcast"])
  );
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEvent | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calculate date range for fetch
  const dateRange = React.useMemo(() => {
    if (viewMode === "month") {
      const from = new Date(year, month, 1);
      from.setDate(from.getDate() - 7); // Include prev month overflow
      const to = new Date(year, month + 1, 7); // Include next month overflow
      return { from: from.toISOString(), to: to.toISOString() };
    } else {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return { from: weekStart.toISOString(), to: weekEnd.toISOString() };
    }
  }, [year, month, viewMode, currentDate]);

  React.useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
    fetch(`/api/calendar?${params}`)
      .then((r) => r.json())
      .then((d) => { setEvents(d.events ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateRange]);

  const filteredEvents = events.filter((e) => filterTypes.has(e.type));

  function eventsByDate(dateStr: string) {
    return filteredEvents.filter((e) => e.date.substring(0, 10) === dateStr);
  }

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + dir);
    } else {
      d.setDate(d.getDate() + dir * 7);
    }
    setCurrentDate(d);
  }

  function toggleFilter(type: string) {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  const today = formatDate(new Date());

  // Month view grid
  function renderMonthView() {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfWeek(year, month);
    const cells: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month overflow
    const prevMonthDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    // Next month overflow
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    }

    return (
      <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden border border-white/10">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-white/[0.02] px-2 py-1.5 text-[11px] font-medium text-muted-foreground text-center">
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          const dateStr = formatDate(cell.date);
          const dayEvents = eventsByDate(dateStr);
          const isToday = dateStr === today;
          return (
            <div
              key={i}
              className={cn(
                "bg-[hsl(225,35%,6%)] min-h-[90px] p-1 transition-colors",
                !cell.isCurrentMonth && "opacity-40",
                isToday && "ring-1 ring-primary/50"
              )}
            >
              <div className={cn(
                "text-xs font-medium mb-0.5 px-1",
                isToday ? "text-primary" : "text-muted-foreground"
              )}>
                {cell.date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left rounded px-1 py-0.5 text-[10px] truncate transition-colors hover:brightness-125"
                    style={{ backgroundColor: ev.color + "20", color: ev.color }}
                  >
                    <span className="mr-0.5">{TYPE_ICONS[ev.type]}</span>
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Week view
  function renderWeekView() {
    const weekStart = startOfWeek(currentDate);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    return (
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dateStr = formatDate(day);
          const dayEvents = eventsByDate(dateStr);
          const isToday = dateStr === today;
          return (
            <div
              key={i}
              className={cn(
                "rounded-xl border border-white/10 bg-white/[0.02] p-2 min-h-[200px]",
                isToday && "border-primary/30"
              )}
            >
              <div className={cn(
                "text-xs font-medium mb-2",
                isToday ? "text-primary" : "text-muted-foreground"
              )}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.getDay()]} {day.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left rounded-lg p-1.5 text-[11px] transition-colors hover:brightness-125"
                    style={{ backgroundColor: ev.color + "15", borderLeft: `2px solid ${ev.color}` }}
                  >
                    <div className="font-medium truncate" style={{ color: ev.color }}>{ev.title}</div>
                    {ev.subtitle && <div className="text-muted-foreground truncate">{ev.subtitle}</div>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
            Deal close dates, stage changes, reminders, and scheduled broadcasts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode */}
          <div className="flex gap-0.5 rounded-lg border border-white/10 p-0.5">
            <button
              onClick={() => setViewMode("month")}
              className={cn("rounded-md px-2 py-1 text-xs transition-colors",
                viewMode === "month" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={cn("rounded-md px-2 py-1 text-xs transition-colors",
                viewMode === "week" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Week
            </button>
          </div>
          {/* Navigation */}
          <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5"
          >
            Today
          </button>
          <button onClick={() => navigate(1)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <span className="text-sm font-medium text-foreground ml-2">
            {viewMode === "month"
              ? `${monthNames[month]} ${year}`
              : `Week of ${monthNames[startOfWeek(currentDate).getMonth()]} ${startOfWeek(currentDate).getDate()}`
            }
          </span>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Show:</span>
        {Object.entries(TYPE_LABELS).map(([type, label]) => {
          const colors: Record<string, string> = {
            close_date: "#3b82f6",
            stage_change: "#8b5cf6",
            reminder: "#f59e0b",
            broadcast: "#10b981",
          };
          const active = filterTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors border",
                active ? "border-transparent" : "border-white/10 text-muted-foreground"
              )}
              style={active ? { backgroundColor: colors[type] + "20", color: colors[type] } : undefined}
            >
              {TYPE_ICONS[type]} {label}
            </button>
          );
        })}
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="h-[500px] rounded-xl bg-white/[0.02] animate-pulse" />
      ) : (
        viewMode === "month" ? renderMonthView() : renderWeekView()
      )}

      {/* Event detail panel */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedEvent(null)}>
          <div
            className="bg-[hsl(225,35%,8%)] border border-white/10 rounded-xl p-5 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: selectedEvent.color + "20", color: selectedEvent.color }}
              >
                {TYPE_LABELS[selectedEvent.type]}
              </span>
              <button onClick={() => setSelectedEvent(null)} className="text-muted-foreground hover:text-foreground">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <h3 className="text-sm font-semibold text-foreground">{selectedEvent.title}</h3>
            {selectedEvent.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{selectedEvent.subtitle}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(selectedEvent.date).toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
            {selectedEvent.meta?.deal_id ? (
              <a
                href={`/pipeline?highlight=${String(selectedEvent.meta.deal_id)}`}
                className="mt-3 inline-block text-xs text-primary hover:text-primary/80"
              >
                View deal in pipeline →
              </a>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
