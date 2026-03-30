"use client";

import * as React from "react";
import Link from "next/link";
import { cn, timeAgo } from "@/lib/utils";
import { CheckSquare, Plus, Clock, AlertTriangle, Loader2, X } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { useTelegramWebApp } from "@/components/tma/use-telegram";

type Task = {
  id: string;
  message: string;
  deal_id: string | null;
  deal_name: string | null;
  due_at: string | null;
  priority: string | null;
  status: string;
  snoozed_until: string | null;
  created_at: string;
};

type Filter = "all" | "due" | "overdue";

export default function TMATasksPage() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [showCreate, setShowCreate] = React.useState(false);
  const [newMessage, setNewMessage] = React.useState("");
  const [newDue, setNewDue] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  useTelegramWebApp();

  React.useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/reminders");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.reminders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newMessage.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newMessage.trim(),
          due_at: newDue ? new Date(newDue).toISOString() : undefined,
        }),
      });
      if (res.ok) {
        setNewMessage("");
        setNewDue("");
        setShowCreate(false);
        fetchTasks();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(id: string, action: "dismiss" | "snooze", snoozeHours?: number) {
    const body: Record<string, unknown> = { action };
    if (action === "snooze" && snoozeHours) {
      body.snooze_until = new Date(Date.now() + snoozeHours * 3600000).toISOString();
    }
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    fetchTasks();
  }

  const now = new Date();
  const filtered = tasks.filter((t) => {
    if (t.status === "dismissed") return false;
    if (filter === "due") return t.due_at && new Date(t.due_at) > now;
    if (filter === "overdue") return t.due_at && new Date(t.due_at) <= now;
    return true;
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "due", label: "Due" },
    { key: "overdue", label: "Overdue" },
  ];

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-20">
        <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />)}
        <BottomTabBar active="tasks" />
      </div>
    );
  }

  const handleRefresh = React.useCallback(async () => {
    await fetchTasks();
  }, []);

  return (
    <div className="pb-20">
      <PullToRefresh onRefresh={handleRefresh}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Tasks</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} active</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="px-4 pb-3 space-y-2">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Task description..."
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm outline-none focus:border-primary/30"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs text-muted-foreground outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newMessage.trim()}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {creating ? "..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-primary/20 text-primary"
                : "bg-white/5 text-muted-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="px-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10">
            <CheckSquare className="mx-auto h-8 w-8 text-muted-foreground/20" />
            <p className="mt-3 text-xs text-muted-foreground">No tasks</p>
          </div>
        ) : (
          filtered.map((task) => {
            const isOverdue = task.due_at && new Date(task.due_at) <= now;
            return (
              <div
                key={task.id}
                className="rounded-xl border border-white/10 bg-white/[0.035] p-3 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  {/* Priority dot */}
                  <div className={cn(
                    "mt-1 h-2 w-2 rounded-full shrink-0",
                    task.priority === "urgent" ? "bg-red-400" :
                    task.priority === "high" ? "bg-orange-400" :
                    task.priority === "low" ? "bg-blue-400" :
                    "bg-white/20"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{task.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.deal_name && (
                        <Link href={`/tma/deals/${task.deal_id}`} className="text-[10px] text-primary truncate">
                          {task.deal_name}
                        </Link>
                      )}
                      {task.due_at && (
                        <span className={cn("text-[10px] flex items-center gap-0.5", isOverdue ? "text-red-400" : "text-muted-foreground")}>
                          {isOverdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                          {timeAgo(task.due_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pl-4">
                  <button
                    onClick={() => handleAction(task.id, "dismiss")}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => handleAction(task.id, "snooze", 4)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Snooze 4h
                  </button>
                  <button
                    onClick={() => handleAction(task.id, "snooze", 24)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Snooze 1d
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      </PullToRefresh>

      <BottomTabBar active="tasks" />
    </div>
  );
}
