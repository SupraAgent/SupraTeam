"use client";

import * as React from "react";
import Link from "next/link";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Clock, Plus, CheckCircle2, AlertTriangle, ArrowRight, X,
  ChevronDown, Snowflake, Zap, StickyNote, User, Flag, Video, ExternalLink,
} from "lucide-react";

// ── Types ──

interface CalendarEvent {
  id: string;
  type: "close_date" | "stage_change" | "reminder" | "broadcast" | "google";
  date: string;
  title: string;
  subtitle?: string;
  color: string;
  meta?: Record<string, unknown>;
}

interface GoogleCalEvent {
  id: string;
  summary: string;
  start_at: string | null;
  start_date: string | null;
  end_at: string | null;
  end_date: string | null;
  is_all_day: boolean;
  html_link: string | null;
  hangout_link: string | null;
  location: string | null;
  attendees: { email: string; displayName?: string }[] | null;
}

interface Task {
  id: string;
  deal_id: string | null;
  reminder_type: "follow_up" | "stale" | "stage_suggestion" | "escalation" | "manual";
  message: string;
  is_dismissed: boolean;
  due_at: string;
  snoozed_until: string | null;
  created_at: string;
  assigned_to: string | null;
  created_by: string | null;
  priority: string | null;
  assigned_profile: { display_name: string; avatar_url: string | null } | null;
  deal: {
    id: string;
    deal_name: string;
    board_type: string;
    stage: { name: string; color: string } | null;
  } | null;
}

type ViewMode = "month" | "week";
type TaskFilter = "all" | "due" | "mine" | "overdue";

// ── Constants ──

const TYPE_LABELS: Record<string, string> = {
  close_date: "Close Date",
  stage_change: "Stage Change",
  reminder: "Reminder",
  broadcast: "Broadcast",
  google: "Google Calendar",
};

const TYPE_ICONS: Record<string, string> = {
  close_date: "$",
  stage_change: "→",
  reminder: "!",
  broadcast: "📢",
  google: "📅",
};

const TASK_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  follow_up: { icon: <Clock className="h-3 w-3" />, label: "Follow Up", color: "text-blue-400" },
  stale: { icon: <Snowflake className="h-3 w-3" />, label: "Stale", color: "text-cyan-400" },
  stage_suggestion: { icon: <ArrowRight className="h-3 w-3" />, label: "Stage Move", color: "text-purple-400" },
  escalation: { icon: <AlertTriangle className="h-3 w-3" />, label: "Escalation", color: "text-red-400" },
  manual: { icon: <StickyNote className="h-3 w-3" />, label: "Task", color: "text-amber-400" },
};

const SNOOZE_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "4h", hours: 4 },
  { label: "1d", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "1w", hours: 168 },
];

// ── Helpers ──

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date) {
  return d.toISOString().substring(0, 10);
}

function toLocalDatetimeValue(dateStr: string) {
  const d = new Date(dateStr);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

// ── Component ──

export default function CalendarPage() {
  // Calendar state
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<ViewMode>("month");
  const [filterTypes, setFilterTypes] = React.useState<Set<string>>(
    new Set(["close_date", "stage_change", "reminder", "broadcast", "google"])
  );
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEvent | null>(null);

  // Task state
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(true);
  const [taskFilter, setTaskFilter] = React.useState<TaskFilter>("all");
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [snoozeMenuId, setSnoozeMenuId] = React.useState<string | null>(null);
  const snoozeRef = React.useRef<HTMLDivElement>(null);

  // Create-task state
  const [createDate, setCreateDate] = React.useState<string | null>(null); // ISO date string when clicking calendar
  const [newMessage, setNewMessage] = React.useState("");
  const [newDueDate, setNewDueDate] = React.useState("");
  const [newPriority, setNewPriority] = React.useState("normal");
  const [creating, setCreating] = React.useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = formatDate(new Date());
  const now = Date.now();

  // ── Data fetching ──

  const dateRange = React.useMemo(() => {
    if (viewMode === "month") {
      const from = new Date(year, month, 1);
      from.setDate(from.getDate() - 7);
      const to = new Date(year, month + 1, 7);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const weekStart = startOfWeek(currentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { from: weekStart.toISOString(), to: weekEnd.toISOString() };
  }, [year, month, viewMode, currentDate]);

  React.useEffect(() => {
    setCalLoading(true);
    const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });

    // Fetch CRM events and Google Calendar events in parallel
    const crmFetch = fetch(`/api/calendar?${params}`)
      .then((r) => r.json())
      .then((d) => (d.events ?? []) as CalendarEvent[])
      .catch(() => [] as CalendarEvent[]);

    const googleFetch = fetch(`/api/calendar/google/events?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => {
        const gEvents = (d.data ?? []) as GoogleCalEvent[];
        return gEvents.map((g): CalendarEvent => ({
          id: `gcal-${g.id}`,
          type: "google",
          date: g.start_at ?? g.start_date ?? "",
          title: g.summary,
          subtitle: g.is_all_day
            ? "All day"
            : g.start_at
              ? new Date(g.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
              : undefined,
          color: "#4285f4",
          meta: {
            html_link: g.html_link,
            hangout_link: g.hangout_link,
            location: g.location,
            attendees: g.attendees,
          },
        }));
      })
      .catch(() => [] as CalendarEvent[]);

    Promise.all([crmFetch, googleFetch])
      .then(([crm, google]) => {
        setEvents([...crm, ...google]);
        setCalLoading(false);
      });
  }, [dateRange]);

  const fetchTasks = React.useCallback(async () => {
    try {
      const res = await fetch("/api/reminders?all=1");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.reminders ?? []);
        if (data.current_user_id) setCurrentUserId(data.current_user_id);
      }
    } finally {
      setTasksLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Close snooze menu on outside click
  React.useEffect(() => {
    if (!snoozeMenuId) return;
    function handleClick(e: MouseEvent) {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [snoozeMenuId]);

  // ── Calendar helpers ──

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

  // ── Task helpers ──

  const isOverdue = (t: Task) => {
    const snoozed = t.snoozed_until && new Date(t.snoozed_until).getTime() > now;
    const dueTime = new Date(t.due_at).getTime();
    return !snoozed && dueTime <= now && (now - dueTime) > 86400000;
  };

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === "due") {
      const snoozed = t.snoozed_until && new Date(t.snoozed_until).getTime() > now;
      return !snoozed && new Date(t.due_at).getTime() <= now;
    }
    if (taskFilter === "mine") return t.assigned_to === currentUserId;
    if (taskFilter === "overdue") return isOverdue(t);
    return true;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    const pa = priorityOrder[a.priority ?? "normal"] ?? 2;
    const pb = priorityOrder[b.priority ?? "normal"] ?? 2;
    if (pa !== pb) return pa - pb;
    const aO = isOverdue(a) ? 0 : 1;
    const bO = isOverdue(b) ? 0 : 1;
    if (aO !== bO) return aO - bO;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  const dueCount = tasks.filter((t) => {
    const snoozed = t.snoozed_until && new Date(t.snoozed_until).getTime() > now;
    return !snoozed && new Date(t.due_at).getTime() <= now;
  }).length;
  const overdueCount = tasks.filter(isOverdue).length;

  async function handleDismiss(id: string) {
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast.success("Task dismissed");
  }

  async function handleSnooze(id: string, hours: number) {
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "snooze", snooze_hours: hours }),
    });
    setSnoozeMenuId(null);
    fetchTasks();
    toast.success(`Snoozed for ${hours >= 24 ? `${hours / 24}d` : `${hours}h`}`);
  }

  function openCreateForDate(dateStr: string) {
    setCreateDate(dateStr);
    setNewDueDate(toLocalDatetimeValue(dateStr + "T09:00:00"));
    setNewMessage("");
    setNewPriority("normal");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newMessage.trim(),
          due_at: newDueDate ? new Date(newDueDate).toISOString() : undefined,
          priority: newPriority,
        }),
      });
      if (res.ok) {
        setCreateDate(null);
        setNewMessage("");
        setNewDueDate("");
        setNewPriority("normal");
        fetchTasks();
        toast.success("Task created");
      }
    } finally {
      setCreating(false);
    }
  }

  // ── Month view ──

  function renderMonthView() {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfWeek(year, month);
    const cells: { date: Date; isCurrentMonth: boolean }[] = [];

    const prevMonthDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
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
          const isSelected = createDate === dateStr;
          return (
            <div
              key={i}
              onClick={() => openCreateForDate(dateStr)}
              className={cn(
                "bg-[hsl(225,35%,6%)] min-h-[80px] p-1 transition-colors cursor-pointer hover:bg-white/[0.04]",
                !cell.isCurrentMonth && "opacity-40",
                isToday && "ring-1 ring-primary/50",
                isSelected && "ring-1 ring-amber-400/60 bg-amber-400/[0.03]"
              )}
            >
              <div className={cn(
                "text-xs font-medium mb-0.5 px-1",
                isToday ? "text-primary" : "text-muted-foreground"
              )}>
                {cell.date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                    className="w-full text-left rounded px-1 py-0.5 text-[10px] truncate transition-colors hover:brightness-125"
                    style={{ backgroundColor: ev.color + "20", color: ev.color }}
                  >
                    <span className="mr-0.5">{TYPE_ICONS[ev.type]}</span>
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 2} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Week view ──

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
          const isSelected = createDate === dateStr;
          return (
            <div
              key={i}
              onClick={() => openCreateForDate(dateStr)}
              className={cn(
                "rounded-xl border border-white/10 bg-white/[0.02] p-2 min-h-[180px] cursor-pointer hover:bg-white/[0.04] transition-colors",
                isToday && "border-primary/30",
                isSelected && "border-amber-400/40 bg-amber-400/[0.02]"
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
                    onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
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

  // ── Render ──

  return (
    <div className="flex gap-4 h-full">
      {/* Left: Calendar */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
            <p className="mt-0.5 text-xs text-muted-foreground hidden sm:block">
              Click any date to create a task.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
              google: "#4285f4",
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
        {calLoading ? (
          <div className="h-[500px] rounded-xl bg-white/[0.02] animate-pulse" />
        ) : (
          viewMode === "month" ? renderMonthView() : renderWeekView()
        )}

        {/* Inline create form (appears below calendar when date clicked) */}
        {createDate && (
          <form
            onSubmit={handleCreate}
            className="rounded-xl border border-amber-400/20 bg-amber-400/[0.03] p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-400">
                New task for {new Date(createDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <button type="button" onClick={() => setCreateDate(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="What needs to be done?"
              className="h-8 text-sm"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="h-8 rounded-lg border border-white/10 bg-transparent px-2 text-xs text-foreground"
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
              <Button type="submit" size="sm" className="h-8" disabled={creating || !newMessage.trim()}>
                {creating ? "..." : "Create"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Right: Task sidebar */}
      <div className="w-80 shrink-0 border-l border-white/10 pl-4 flex flex-col min-h-0">
        {/* Task header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {overdueCount > 0
                ? <span className="text-red-400">{overdueCount} overdue</span>
                : dueCount > 0
                  ? `${dueCount} due`
                  : "All clear"}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => { setTasksLoading(true); fetch("/api/reminders", { method: "POST" }).then(() => fetchTasks()); }}
              title="Generate from stage rules"
            >
              <Zap className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => openCreateForDate(today)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Quick filters */}
        <div className="flex gap-1 mb-3">
          {([
            { key: "all" as const, label: "All", count: tasks.length },
            { key: "due" as const, label: "Due", count: dueCount },
            { key: "overdue" as const, label: "Overdue", count: overdueCount },
            { key: "mine" as const, label: "Mine" },
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setTaskFilter(f.key)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                taskFilter === f.key
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
              {f.count != null && f.count > 0 && (
                <span className={cn(
                  "ml-1 text-[9px]",
                  f.key === "overdue" ? "text-red-400" :
                  f.key === "due" ? "text-amber-400" : "text-muted-foreground"
                )}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {tasksLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="mx-auto h-6 w-6 text-green-400/30" />
              <p className="mt-2 text-xs text-muted-foreground">No tasks</p>
            </div>
          ) : (
            sortedTasks.map((task) => {
              const config = TASK_TYPE_CONFIG[task.reminder_type] ?? TASK_TYPE_CONFIG.manual;
              const isDue = new Date(task.due_at).getTime() <= now;
              const isSnoozed = task.snoozed_until && new Date(task.snoozed_until).getTime() > now;
              const taskOverdue = isOverdue(task);

              return (
                <div
                  key={task.id}
                  className={cn(
                    "group rounded-lg border p-2.5 transition-colors hover:bg-white/[0.04]",
                    taskOverdue ? "border-red-500/30 bg-red-500/[0.02]" :
                    isDue && !isSnoozed ? "border-white/15 bg-white/[0.02]" : "border-white/8 bg-white/[0.01]"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {/* Priority dot + icon */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                      {task.priority && task.priority !== "normal" && (
                        <div className={cn("h-1.5 w-1.5 rounded-full", {
                          "bg-red-400": task.priority === "urgent",
                          "bg-orange-400": task.priority === "high",
                          "bg-muted-foreground/30": task.priority === "low",
                        })} />
                      )}
                      <div className={cn("shrink-0", config.color)}>{config.icon}</div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs leading-snug",
                        taskOverdue ? "text-red-300" : "text-foreground"
                      )}>{task.message}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {task.deal && (
                          <Link
                            href={`/pipeline?highlight=${task.deal.id}`}
                            className="text-[9px] text-primary hover:text-primary/80 flex items-center gap-0.5 truncate max-w-[120px]"
                          >
                            {task.deal.stage && (
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: task.deal.stage.color }} />
                            )}
                            {task.deal.deal_name}
                          </Link>
                        )}
                        {task.assigned_profile && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            {task.assigned_profile.avatar_url ? (
                              <img src={task.assigned_profile.avatar_url} alt="" className="h-3 w-3 rounded-full" />
                            ) : (
                              <User className="h-2.5 w-2.5" />
                            )}
                          </span>
                        )}
                        {taskOverdue && (
                          <span className="text-[9px] text-red-400 font-medium">
                            {timeAgo(task.due_at)}
                          </span>
                        )}
                        {!taskOverdue && isDue && !isSnoozed && (
                          <span className="text-[9px] text-amber-400">{timeAgo(task.due_at)}</span>
                        )}
                        {isSnoozed && (
                          <span className="text-[9px] text-muted-foreground">
                            snoozed
                          </span>
                        )}
                        {!isDue && !isSnoozed && (
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(task.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Snooze */}
                      <div ref={snoozeMenuId === task.id ? snoozeRef : undefined} className="relative">
                        <button
                          onClick={() => setSnoozeMenuId(snoozeMenuId === task.id ? null : task.id)}
                          className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex items-center justify-center"
                          title="Snooze"
                        >
                          <Clock className="h-3 w-3" />
                        </button>
                        {snoozeMenuId === task.id && (
                          <div className="absolute right-0 top-7 rounded-lg border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl py-1 min-w-[80px] z-50">
                            {SNOOZE_OPTIONS.map((opt) => (
                              <button
                                key={opt.hours}
                                onClick={() => handleSnooze(task.id, opt.hours)}
                                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-white/10"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Dismiss */}
                      <button
                        onClick={() => handleDismiss(task.id)}
                        className="h-6 w-6 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
                        title="Dismiss"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 mt-2 border-t border-white/5">
          <Link href="/settings/pipeline" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            Configure auto-reminder rules
          </Link>
        </div>
      </div>

      {/* Event detail modal */}
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
                <X className="h-4 w-4" />
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
            {selectedEvent.type === "google" && typeof selectedEvent.meta?.hangout_link === "string" ? (
              <a
                href={selectedEvent.meta.hangout_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
              >
                <Video className="h-3 w-3" />
                Join Google Meet
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {selectedEvent.type === "google" && typeof selectedEvent.meta?.html_link === "string" ? (
              <a
                href={selectedEvent.meta.html_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Open in Google Calendar
              </a>
            ) : null}
            {selectedEvent.type === "google" && typeof selectedEvent.meta?.location === "string" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Location: {selectedEvent.meta.location}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
