"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SnoozePickerProps = {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  onSnoozed?: () => void;
};

const QUICK_OPTIONS = [
  { label: "Later today", hours: 3, icon: "🕐" },
  { label: "Tomorrow morning", hours: 14, icon: "🌅" },
  { label: "Tomorrow afternoon", hours: 20, icon: "☀️" },
  { label: "This weekend", daysUntilSat: true, icon: "📅" },
  { label: "Next week", daysUntilMon: true, icon: "📆" },
];

function getSnoozeTime(option: typeof QUICK_OPTIONS[number]): Date {
  const now = new Date();

  if (option.hours) {
    return new Date(now.getTime() + option.hours * 60 * 60 * 1000);
  }

  if (option.daysUntilSat) {
    const day = now.getDay();
    const daysUntil = day <= 6 ? (6 - day) || 7 : 1;
    const sat = new Date(now);
    sat.setDate(sat.getDate() + daysUntil);
    sat.setHours(9, 0, 0, 0);
    return sat;
  }

  if (option.daysUntilMon) {
    const day = now.getDay();
    const daysUntil = day === 0 ? 1 : (8 - day);
    const mon = new Date(now);
    mon.setDate(mon.getDate() + daysUntil);
    mon.setHours(9, 0, 0, 0);
    return mon;
  }

  return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}

export function SnoozePicker({ open, onClose, threadId, onSnoozed }: SnoozePickerProps) {
  const [customDate, setCustomDate] = React.useState("");
  const [customTime, setCustomTime] = React.useState("09:00");
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const threadIdRef = React.useRef(threadId);
  threadIdRef.current = threadId;
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const onSnoozedRef = React.useRef(onSnoozed);
  onSnoozedRef.current = onSnoozed;

  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, QUICK_OPTIONS.length));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && selectedIndex < QUICK_OPTIONS.length) {
        e.preventDefault();
        handleQuickSnooze(QUICK_OPTIONS[selectedIndex]);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, selectedIndex]);

  async function handleQuickSnooze(option: typeof QUICK_OPTIONS[number]) {
    if (!threadId) return;
    const time = getSnoozeTime(option);
    await scheduleSnooze(threadId, time.toISOString());
    toast(`Snoozed until ${formatFriendlyTime(time)}`);
    onSnoozed?.();
    onClose();
  }

  async function handleCustomSnooze() {
    if (!threadId || !customDate) return;
    const time = new Date(`${customDate}T${customTime}`);
    if (time <= new Date()) {
      toast.error("Pick a future time");
      return;
    }
    await scheduleSnooze(threadId, time.toISOString());
    toast(`Snoozed until ${formatFriendlyTime(time)}`);
    onSnoozed?.();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-72 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "hsl(var(--surface-4))" }}
      >
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-foreground">Snooze until...</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Thread will reappear at the selected time</p>
        </div>

        <div className="p-2 space-y-0.5">
          {QUICK_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => handleQuickSnooze(opt)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                selectedIndex === i ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
              )}
            >
              <span className="text-base">{opt.icon}</span>
              <div>
                <p className="text-xs text-foreground">{opt.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatFriendlyTime(getSnoozeTime(opt))}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Custom date/time */}
        <div className="border-t border-white/10 px-3 py-2.5 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Custom</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-foreground outline-none"
            />
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-foreground outline-none"
            />
          </div>
          <button
            onClick={handleCustomSnooze}
            disabled={!customDate}
            className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40"
          >
            Snooze
          </button>
        </div>
      </div>
    </div>
  );
}

async function scheduleSnooze(threadId: string, scheduledFor: string) {
  // Archive the thread first (remove from inbox)
  await fetch(`/api/email/threads/${threadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "archive" }),
  });

  // Get default connection for scheduling
  const connRes = await fetch("/api/email/connections");
  const connJson = await connRes.json();
  const defaultConn = (connJson.data ?? []).find((c: { is_default: boolean }) => c.is_default) ?? connJson.data?.[0];

  if (!defaultConn) return;

  // Schedule the snooze
  await fetch("/api/email/scheduled", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "snooze",
      connection_id: defaultConn.id,
      thread_id: threadId,
      scheduled_for: scheduledFor,
    }),
  });
}

function formatFriendlyTime(date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) {
    return `Today ${timeStr}`;
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${timeStr}`;
  }

  const dayName = date.toLocaleDateString([], { weekday: "short" });
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dayName} ${dateStr} ${timeStr}`;
}
