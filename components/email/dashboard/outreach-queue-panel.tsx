"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Send, SkipForward, Pause, Clock, CheckCircle, RotateCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface QueueItem {
  enrollmentId: string;
  sequenceName: string;
  sequenceId: string;
  currentStep: number;
  totalSteps: number;
  stepType: string;
  messagePreview: string;
  nextSendAt: string;
  isPastDue: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactTelegram: string | null;
  dealName: string | null;
  dealId: string | null;
  boardType: string | null;
}

export function OutreachQueuePanel() {
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<string | null>(null);

  const fetchQueue = React.useCallback(() => {
    setLoading(true);
    fetch("/api/plugins/outreach-queue")
      .then((r) => r.json())
      .then((json) => setItems(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function handleAction(enrollmentId: string, action: "skip" | "pause") {
    setActing(enrollmentId);
    try {
      const status = action === "skip" ? "completed" : "paused";
      await fetch(`/api/outreach/enrollments/${enrollmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setItems((prev) => prev.filter((i) => i.enrollmentId !== enrollmentId));
      toast(action === "skip" ? "Step skipped" : "Sequence paused");
    } catch {
      toast.error("Action failed");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white/5 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <CheckCircle className="h-8 w-8 opacity-20" />
        <p className="text-xs">No outreach steps due today</p>
        <Link
          href="/outreach"
          className="text-[10px] text-primary hover:underline"
        >
          Manage sequences
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.enrollmentId}
          className={cn(
            "rounded-lg border px-3 py-2.5 transition",
            item.isPastDue
              ? "border-orange-500/20 bg-orange-500/5"
              : "border-white/10 hover:bg-white/[0.02]"
          )}
        >
          {/* Header row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {item.isPastDue && <AlertCircle className="h-3 w-3 text-orange-400 shrink-0" />}
              <span className="text-xs font-medium text-foreground truncate">
                {item.contactName || item.contactEmail || "Unknown"}
              </span>
              <span className="text-[9px] text-muted-foreground shrink-0">
                Step {item.currentStep}/{item.totalSteps}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleAction(item.enrollmentId, "skip")}
                disabled={acting === item.enrollmentId}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                title="Skip step"
              >
                <SkipForward className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleAction(item.enrollmentId, "pause")}
                disabled={acting === item.enrollmentId}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                title="Pause sequence"
              >
                <Pause className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Details */}
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-2">
              <Send className="h-2.5 w-2.5 text-primary shrink-0" />
              <span className="text-[10px] text-primary truncate">{item.sequenceName}</span>
            </div>
            {item.messagePreview && (
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                {item.messagePreview}
              </p>
            )}
            <div className="flex items-center gap-2">
              {item.dealName && (
                <Link
                  href={`/pipeline?deal=${item.dealId}`}
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors truncate"
                >
                  {item.dealName}
                </Link>
              )}
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 shrink-0">
                <Clock className="h-2 w-2" />
                {new Date(item.nextSendAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        </div>
      ))}

      {/* Refresh */}
      <button
        onClick={fetchQueue}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition w-full justify-center py-1"
      >
        <RotateCcw className="h-3 w-3" />
        Refresh
      </button>
    </div>
  );
}
