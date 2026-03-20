"use client";

import * as React from "react";
import Link from "next/link";
import { timeAgo, cn } from "@/lib/utils";
import {
  Bell, Clock, Plus, CheckCircle2, AlertTriangle, ArrowRight, X,
  ChevronDown, Snowflake, Zap, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Task = {
  id: string;
  deal_id: string | null;
  reminder_type: "follow_up" | "stale" | "stage_suggestion" | "escalation" | "manual";
  message: string;
  is_dismissed: boolean;
  due_at: string;
  snoozed_until: string | null;
  created_at: string;
  deal: {
    id: string;
    deal_name: string;
    board_type: string;
    stage: { name: string; color: string } | null;
  } | null;
};

type Filter = "all" | "due" | "snoozed" | "manual" | "auto";

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  follow_up: { icon: <Clock className="h-3.5 w-3.5" />, label: "Follow Up", color: "text-blue-400" },
  stale: { icon: <Snowflake className="h-3.5 w-3.5" />, label: "Stale", color: "text-cyan-400" },
  stage_suggestion: { icon: <ArrowRight className="h-3.5 w-3.5" />, label: "Stage Move", color: "text-purple-400" },
  escalation: { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Escalation", color: "text-red-400" },
  manual: { icon: <StickyNote className="h-3.5 w-3.5" />, label: "Task", color: "text-amber-400" },
};

const SNOOZE_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "4h", hours: 4 },
  { label: "1d", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "1w", hours: 168 },
];

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [showCreate, setShowCreate] = React.useState(false);
  const [newMessage, setNewMessage] = React.useState("");
  const [newDueDate, setNewDueDate] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [snoozeMenuId, setSnoozeMenuId] = React.useState<string | null>(null);
  const snoozeRef = React.useRef<HTMLDivElement>(null);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/reminders?all=1");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.reminders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchTasks(); }, []);

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
        }),
      });
      if (res.ok) {
        setNewMessage("");
        setNewDueDate("");
        setShowCreate(false);
        fetchTasks();
        toast.success("Task created");
      }
    } finally {
      setCreating(false);
    }
  }

  const now = Date.now();
  const filtered = tasks.filter((t) => {
    if (filter === "due") {
      const snoozed = t.snoozed_until && new Date(t.snoozed_until).getTime() > now;
      return !snoozed && new Date(t.due_at).getTime() <= now;
    }
    if (filter === "snoozed") return t.snoozed_until && new Date(t.snoozed_until).getTime() > now;
    if (filter === "manual") return t.reminder_type === "manual";
    if (filter === "auto") return t.reminder_type !== "manual";
    return true;
  });

  const dueCount = tasks.filter((t) => {
    const snoozed = t.snoozed_until && new Date(t.snoozed_until).getTime() > now;
    return !snoozed && new Date(t.due_at).getTime() <= now;
  }).length;

  const snoozedCount = tasks.filter((t) => t.snoozed_until && new Date(t.snoozed_until).getTime() > now).length;

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: tasks.length },
    { key: "due", label: "Due Now", count: dueCount },
    { key: "snoozed", label: "Snoozed", count: snoozedCount },
    { key: "manual", label: "Manual" },
    { key: "auto", label: "Auto-generated" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tasks & Reminders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dueCount > 0 ? `${dueCount} task${dueCount !== 1 ? "s" : ""} need attention` : "All caught up"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setLoading(true); fetch("/api/reminders", { method: "POST" }).then(() => fetchTasks()); }}
            title="Generate auto-reminders from stage rules"
          >
            <Zap className="h-3.5 w-3.5 mr-1" /> Generate
          </Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Task
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Task Description *</label>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="What needs to be done?"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Due Date (optional)</label>
            <Input
              type="datetime-local"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={creating || !newMessage.trim()}>
              {creating ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              filter === f.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
            {f.count != null && f.count > 0 && (
              <span className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                f.key === "due" && f.count > 0 ? "bg-red-500/20 text-red-400" : "bg-white/10 text-muted-foreground"
              )}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-400/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filter === "all" ? "No tasks. Create one or generate from stage rules." : "No tasks match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const config = TYPE_CONFIG[task.reminder_type] ?? TYPE_CONFIG.manual;
            const isDue = new Date(task.due_at).getTime() <= now;
            const isSnoozed = task.snoozed_until && new Date(task.snoozed_until).getTime() > now;

            return (
              <div
                key={task.id}
                className={cn(
                  "group rounded-xl border bg-white/[0.03] p-3.5 transition-colors hover:bg-white/[0.05]",
                  isDue && !isSnoozed ? "border-white/15" : "border-white/8"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div className={cn("mt-0.5 shrink-0", config.color)}>
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{task.message}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-white/5", config.color)}>
                        {config.label}
                      </span>

                      {task.deal && (
                        <Link
                          href={`/pipeline?highlight=${task.deal.id}`}
                          className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5"
                        >
                          {task.deal.stage && (
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: task.deal.stage.color }} />
                          )}
                          {task.deal.deal_name}
                        </Link>
                      )}

                      {isSnoozed && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          Until {new Date(task.snoozed_until!).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}

                      {!isSnoozed && isDue && (
                        <span className="text-[10px] text-red-400">
                          Due {timeAgo(task.due_at)}
                        </span>
                      )}

                      {!isDue && !isSnoozed && (
                        <span className="text-[10px] text-muted-foreground">
                          Due {new Date(task.due_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative">
                    {/* Snooze */}
                    <div ref={snoozeMenuId === task.id ? snoozeRef : undefined} className="relative">
                      <button
                        onClick={() => setSnoozeMenuId(snoozeMenuId === task.id ? null : task.id)}
                        className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex items-center gap-1"
                        title="Snooze"
                      >
                        <Clock className="h-3 w-3" />
                        <ChevronDown className="h-2.5 w-2.5" />
                      </button>
                      {snoozeMenuId === task.id && (
                        <div className="absolute right-0 top-8 rounded-lg border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl py-1 min-w-[100px] z-50">
                          {SNOOZE_OPTIONS.map((opt) => (
                            <button
                              key={opt.hours}
                              onClick={() => handleSnooze(task.id, opt.hours)}
                              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-white/10"
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
                      className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1"
                      title="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer link */}
      <div className="text-center pt-4">
        <Link href="/settings/pipeline" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Configure auto-reminder rules in Pipeline Settings
        </Link>
      </div>
    </div>
  );
}
