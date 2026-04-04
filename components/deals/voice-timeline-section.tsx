"use client";

import * as React from "react";
import { Mic, Plus, Loader2 } from "lucide-react";
import { VoiceTranscriptionCard } from "@/components/voice/voice-transcription-card";
import type { VoiceTranscription, ActionItem } from "@/components/voice/voice-transcription-card";

interface VoiceTimelineSectionProps {
  dealId: string;
}

export function VoiceTimelineSection({ dealId }: VoiceTimelineSectionProps) {
  const [transcriptions, setTranscriptions] = React.useState<VoiceTranscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showLinkModal, setShowLinkModal] = React.useState(false);

  const fetchTranscriptions = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/voice/transcriptions?deal_id=${dealId}&limit=50`);
      if (!res.ok) return;
      const json = await res.json();
      setTranscriptions(json.data ?? []);
    } catch {
      // Silently fail — section is supplementary
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  React.useEffect(() => {
    fetchTranscriptions();
  }, [fetchTranscriptions]);

  const handleActionItemToggle = async (transcriptionId: string, items: ActionItem[]) => {
    // Optimistic update
    setTranscriptions((prev) =>
      prev.map((t) => (t.id === transcriptionId ? { ...t, action_items: items } : t))
    );

    try {
      await fetch(`/api/voice/transcriptions/${transcriptionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_items: items }),
      });
    } catch {
      // Revert on failure
      fetchTranscriptions();
    }
  };

  const handleRetranscribe = async (transcriptionId: string) => {
    // Optimistic status update
    setTranscriptions((prev) =>
      prev.map((t) =>
        t.id === transcriptionId ? { ...t, transcription_status: "processing" as const } : t
      )
    );

    try {
      await fetch(`/api/voice/transcriptions/${transcriptionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retranscribe" }),
      });

      // Poll for completion
      const poll = setInterval(async () => {
        const res = await fetch(`/api/voice/transcriptions/${transcriptionId}`);
        if (!res.ok) return;
        const json = await res.json();
        const status = json.data?.transcription_status;
        if (status === "completed" || status === "failed") {
          clearInterval(poll);
          fetchTranscriptions();
        }
      }, 3000);

      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(poll), 120_000);
    } catch {
      fetchTranscriptions();
    }
  };

  const handleLinkVoiceNote = async () => {
    setShowLinkModal(true);
    // Fetch unlinked transcriptions for the user
    try {
      const res = await fetch("/api/voice/transcriptions?status=completed&limit=20");
      if (!res.ok) return;
      const json = await res.json();
      const unlinked = (json.data ?? []).filter(
        (t: VoiceTranscription) => !t.linked_deal_id
      );
      setUnlinkedTranscriptions(unlinked);
    } catch {
      // Ignore
    }
  };

  const [unlinkedTranscriptions, setUnlinkedTranscriptions] = React.useState<VoiceTranscription[]>(
    []
  );

  const linkTranscriptionToDeal = async (transcriptionId: string) => {
    try {
      await fetch(`/api/voice/transcriptions/${transcriptionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_deal_id: dealId }),
      });
      setShowLinkModal(false);
      fetchTranscriptions();
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading voice notes...
      </div>
    );
  }

  const completedCount = transcriptions.filter(
    (t) => t.transcription_status === "completed"
  ).length;
  const totalActionItems = transcriptions.reduce(
    (sum, t) => sum + t.action_items.filter((i) => !i.done).length,
    0
  );

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-zinc-200">
            Voice Notes
            {completedCount > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">({completedCount})</span>
            )}
          </span>
          {totalActionItems > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
              {totalActionItems} pending
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleLinkVoiceNote}
          className="flex items-center gap-1 rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
        >
          <Plus className="h-3 w-3" />
          Link Voice Note
        </button>
      </div>

      {/* Transcription list */}
      {transcriptions.length === 0 && (
        <p className="py-3 text-center text-sm text-zinc-500">
          No voice notes linked to this deal yet
        </p>
      )}

      {transcriptions.map((t) => (
        <VoiceTranscriptionCard
          key={t.id}
          transcription={t}
          compact
          onActionItemToggle={handleActionItemToggle}
          onRetranscribe={handleRetranscribe}
        />
      ))}

      {/* Link modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-200">Link a Voice Note</h3>
            {unlinkedTranscriptions.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">
                No unlinked voice notes available
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {unlinkedTranscriptions.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => linkTranscriptionToDeal(t.id)}
                    className="flex w-full items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-800/50"
                  >
                    <Mic className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                    <span className="truncate text-zinc-300">
                      {t.summary || t.transcription_text?.slice(0, 80) || "Voice note"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowLinkModal(false)}
              className="mt-3 w-full rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
