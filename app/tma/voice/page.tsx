"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic, ChevronLeft, Loader2, Search, CheckSquare } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { useOfflineCache } from "@/lib/client/tma-offline";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { hapticImpact } from "@/components/tma/haptic";

interface ActionItem {
  text: string;
  assignee_hint: string | null;
  deadline_hint: string | null;
  priority: "high" | "medium" | "low";
  done?: boolean;
}

interface VoiceTranscription {
  id: string;
  transcription_text: string | null;
  transcription_status: "pending" | "processing" | "completed" | "failed";
  duration_seconds: number | null;
  summary: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  action_items: ActionItem[];
  created_at: string;
  deal?: { id: string; deal_name: string; board_type: string } | null;
  contact?: { id: string; name: string; telegram_username: string | null } | null;
}

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-400",
  neutral: "bg-zinc-400",
  negative: "bg-red-400",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TMAVoicePage() {
  const router = useRouter();
  const [transcriptions, setTranscriptions] = React.useState<VoiceTranscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  useTelegramWebApp();

  // Offline cache for voice transcriptions
  const voiceUrl = search ? null : "/api/voice/transcriptions?limit=30";
  const voiceCache = useOfflineCache<{ data: VoiceTranscription[] }>(voiceUrl, { maxAgeMs: 5 * 60_000 });

  const fetchData = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/voice/transcriptions?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      setTranscriptions(json.data ?? []);
    } catch {
      // Network failed — fall back to offline cache
      if (voiceCache.data) {
        setTranscriptions(voiceCache.data.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, voiceCache.data]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = (id: string) => {
    hapticImpact("light");
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleDealTap = (dealId: string) => {
    hapticImpact("medium");
    router.push(`/tma/deals/${dealId}`);
  };

  const [creatingTask, setCreatingTask] = React.useState<string | null>(null);
  const [creatingAll, setCreatingAll] = React.useState<string | null>(null);

  const handleCreateAllTasks = async (transcription: VoiceTranscription) => {
    if (creatingAll) return;
    setCreatingAll(transcription.id);
    hapticImpact("medium");
    const pending = transcription.action_items.filter((i) => !i.done);
    for (const item of pending) {
      try {
        await fetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: item.text,
            deal_id: transcription.deal?.id ?? undefined,
            due_at: item.deadline_hint ? new Date(item.deadline_hint).toISOString() : undefined,
            priority: item.priority,
            source: "voice_note",
            source_id: transcription.id,
          }),
        });
      } catch {
        // Continue with remaining items
      }
    }
    // Mark all as done locally
    setTranscriptions((prev) =>
      prev.map((t) =>
        t.id === transcription.id
          ? { ...t, action_items: t.action_items.map((ai) => ({ ...ai, done: true })) }
          : t
      )
    );
    hapticImpact("light");
    setCreatingAll(null);
  };

  const handleCreateTask = async (
    transcriptionId: string,
    item: ActionItem,
    dealId?: string
  ) => {
    const key = `${transcriptionId}-${item.text}`;
    if (creatingTask) return;
    setCreatingTask(key);
    hapticImpact("medium");
    try {
      const dueAt = item.deadline_hint
        ? new Date(item.deadline_hint).toISOString()
        : undefined;
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: item.text,
          deal_id: dealId ?? undefined,
          due_at: dueAt,
          priority: item.priority,
          source: "voice_note",
          source_id: transcriptionId,
        }),
      });
      if (res.ok) {
        hapticImpact("light");
        // Mark item as done locally
        setTranscriptions((prev) =>
          prev.map((t) =>
            t.id === transcriptionId
              ? {
                  ...t,
                  action_items: t.action_items.map((ai) =>
                    ai.text === item.text ? { ...ai, done: true } : ai
                  ),
                }
              : t
          )
        );
      }
    } catch {
      // Silent fail
    } finally {
      setCreatingTask(null);
    }
  };

  return (
    <PullToRefresh onRefresh={fetchData}>
      <div className="flex min-h-dvh flex-col bg-[hsl(225,35%,5%)]">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-zinc-800/50 bg-[hsl(225,35%,5%)]/90 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-full p-1 text-zinc-400 hover:text-zinc-200"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <Mic className="h-5 w-5 text-violet-400" />
            <h1 className="text-lg font-semibold text-zinc-100">Voice Notes</h1>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search transcriptions..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500/50 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 px-4 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!loading && transcriptions.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Mic className="h-8 w-8 text-zinc-600" />
              <p className="text-sm text-zinc-500">No voice notes yet</p>
              <p className="text-xs text-zinc-600">
                Send voice messages in Telegram groups linked to deals
              </p>
            </div>
          )}

          {transcriptions.map((t) => {
            const isExpanded = expandedId === t.id;
            const pendingActions = t.action_items.filter((i) => !i.done).length;

            return (
              <div
                key={t.id}
                className="rounded-xl border border-zinc-800/70 bg-zinc-900/60"
              >
                {/* Row */}
                <button
                  type="button"
                  onClick={() => handleToggle(t.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
                    <Mic className="h-4 w-4 text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-200">
                        {t.transcription_status === "completed"
                          ? t.summary || "Voice note"
                          : t.transcription_status === "failed"
                            ? "Transcription failed"
                            : "Transcribing..."}
                      </span>
                      {t.sentiment && (
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            SENTIMENT_DOT[t.sentiment]
                          )}
                        />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                      <span>{timeAgo(t.created_at)}</span>
                      {t.duration_seconds != null && (
                        <span>{formatDuration(t.duration_seconds)}</span>
                      )}
                      {pendingActions > 0 && (
                        <span className="text-amber-400">{pendingActions} actions</span>
                      )}
                      {t.deal && (
                        <span className="truncate text-violet-400">{t.deal.deal_name}</span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && t.transcription_status === "completed" && (
                  <div className="border-t border-zinc-800/50 px-4 py-3 space-y-3">
                    {t.transcription_text && (
                      <p className="text-sm leading-relaxed text-zinc-400">
                        {t.transcription_text}
                      </p>
                    )}

                    {t.action_items.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Action Items
                        </span>
                        {t.action_items.map((item, i) => {
                          const taskKey = `${t.id}-${item.text}`;
                          return (
                            <div
                              key={i}
                              className={cn(
                                "flex items-center gap-2 rounded px-2 py-1 text-sm",
                                item.done ? "text-zinc-600 line-through" : "text-zinc-300"
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                  item.priority === "high"
                                    ? "bg-red-400"
                                    : item.priority === "medium"
                                      ? "bg-amber-400"
                                      : "bg-zinc-500"
                                )}
                              />
                              <span className="flex-1">{item.text}</span>
                              {!item.done && (
                                <button
                                  type="button"
                                  onClick={() => handleCreateTask(t.id, item, t.deal?.id)}
                                  disabled={creatingTask === taskKey}
                                  className="shrink-0 rounded p-1 text-violet-400 hover:bg-violet-500/10 disabled:opacity-50"
                                  title="Create task"
                                >
                                  {creatingTask === taskKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckSquare className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {t.action_items.filter((i) => !i.done).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleCreateAllTasks(t)}
                            disabled={creatingAll === t.id}
                            className="mt-2 w-full rounded-lg bg-violet-500/10 px-3 py-1.5 text-center text-xs font-medium text-violet-400 disabled:opacity-50"
                          >
                            {creatingAll === t.id ? "Creating..." : `Create All ${t.action_items.filter((i) => !i.done).length} Tasks`}
                          </button>
                        )}
                      </div>
                    )}

                    {t.deal && (
                      <button
                        type="button"
                        onClick={() => handleDealTap(t.deal!.id)}
                        className="w-full rounded-lg bg-violet-500/10 px-3 py-2 text-center text-sm font-medium text-violet-400"
                      >
                        View Deal: {t.deal.deal_name}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PullToRefresh>
  );
}
