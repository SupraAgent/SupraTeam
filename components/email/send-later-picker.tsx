"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SendLaterPickerProps = {
  open: boolean;
  onClose: () => void;
  onSchedule: (scheduledFor: string) => void;
};

const QUICK_OPTIONS = [
  { label: "In 1 hour", hours: 1 },
  { label: "In 2 hours", hours: 2 },
  { label: "Tomorrow 9am", tomorrowHour: 9 },
  { label: "Tomorrow 1pm", tomorrowHour: 13 },
  { label: "Monday 9am", nextMondayHour: 9 },
];

function getScheduleTime(option: typeof QUICK_OPTIONS[number]): Date {
  const now = new Date();

  if (option.hours) {
    return new Date(now.getTime() + option.hours * 60 * 60 * 1000);
  }

  if (option.tomorrowHour !== undefined) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(option.tomorrowHour, 0, 0, 0);
    return tomorrow;
  }

  if (option.nextMondayHour !== undefined) {
    const day = now.getDay();
    const daysUntil = day === 0 ? 1 : (8 - day);
    const mon = new Date(now);
    mon.setDate(mon.getDate() + daysUntil);
    mon.setHours(option.nextMondayHour, 0, 0, 0);
    return mon;
  }

  return new Date(now.getTime() + 60 * 60 * 1000);
}

export function SendLaterPicker({ open, onClose, onSchedule }: SendLaterPickerProps) {
  const [customDate, setCustomDate] = React.useState("");
  const [customTime, setCustomTime] = React.useState("09:00");
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open) { setCustomDate(""); setCustomTime("09:00"); setSelectedIndex(0); }
  }, [open]);

  function handleQuick(option: typeof QUICK_OPTIONS[number]) {
    const time = getScheduleTime(option);
    onSchedule(time.toISOString());
    toast(`Scheduled for ${formatFriendlyTime(time)}`);
    onClose();
  }

  function handleCustom() {
    if (!customDate) return;
    const time = new Date(`${customDate}T${customTime}`);
    if (time <= new Date()) {
      toast.error("Pick a future time");
      return;
    }
    onSchedule(time.toISOString());
    toast(`Scheduled for ${formatFriendlyTime(time)}`);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="absolute bottom-full mb-2 left-0 w-64 rounded-xl border border-white/10 shadow-2xl overflow-hidden z-10 animate-dropdown-in"
      style={{ backgroundColor: "hsl(var(--surface-4))" }}
    >
      <div className="px-3 py-2 border-b border-white/10">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Send later</p>
      </div>

      <div className="p-1.5 space-y-0.5">
        {QUICK_OPTIONS.map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => handleQuick(opt)}
            onMouseEnter={() => setSelectedIndex(i)}
            className={cn(
              "w-full text-left rounded-lg px-2.5 py-2 transition-colors",
              selectedIndex === i ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
            )}
          >
            <p className="text-xs text-foreground">{opt.label}</p>
            <p className="text-[10px] text-muted-foreground">
              {formatFriendlyTime(getScheduleTime(opt))}
            </p>
          </button>
        ))}
      </div>

      <div className="border-t border-white/10 px-2.5 py-2 space-y-2">
        <div className="flex gap-1.5">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground outline-none"
          />
          <input
            type="time"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground outline-none"
          />
        </div>
        <button
          onClick={handleCustom}
          disabled={!customDate}
          className="w-full rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition disabled:opacity-40"
        >
          Schedule
        </button>
      </div>
    </div>
  );
}

function formatFriendlyTime(date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Today ${timeStr}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${timeStr}`;
  const dayName = date.toLocaleDateString([], { weekday: "short" });
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dayName} ${dateStr} ${timeStr}`;
}
