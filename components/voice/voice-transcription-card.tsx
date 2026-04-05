"use client";

import * as React from "react";
import {
  Mic,
  Clock,
  ChevronDown,
  ChevronUp,
  Link,
  User,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

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
  language: string | null;
  confidence_score: number | null;
  error_message: string | null;
  linked_deal_id: string | null;
  linked_contact_id: string | null;
  created_at: string;
  transcribed_at: string | null;
  deal?: { id: string; deal_name: string; board_type: string } | null;
  contact?: { id: string; name: string; telegram_username: string | null } | null;
}

interface VoiceTranscriptionCardProps {
  transcription: VoiceTranscription;
  compact?: boolean;
  onLinkDeal?: (transcriptionId: string) => void;
  onLinkContact?: (transcriptionId: string) => void;
  onActionItemToggle?: (transcriptionId: string, items: ActionItem[]) => void;
  onRetranscribe?: (transcriptionId: string) => void;
}

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  neutral: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  negative: "bg-red-500/10 text-red-400 border-red-500/20",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-zinc-400",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceTranscriptionCard({
  transcription,
  compact = false,
  onLinkDeal,
  onLinkContact,
  onActionItemToggle,
  onRetranscribe,
}: VoiceTranscriptionCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  const isLoading =
    transcription.transcription_status === "pending" ||
    transcription.transcription_status === "processing";
  const isFailed = transcription.transcription_status === "failed";
  const isCompleted = transcription.transcription_status === "completed";

  const handleActionToggle = (index: number) => {
    if (!onActionItemToggle) return;
    const updated = transcription.action_items.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    );
    onActionItemToggle(transcription.id, updated);
  };

  // Compact mode: single-line summary for deal timeline
  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors"
      >
        <Mic className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        <span className="truncate text-zinc-300">
          {isLoading && "Transcribing voice note..."}
          {isFailed && "Transcription failed"}
          {isCompleted && (transcription.summary || "Voice note transcribed")}
        </span>
        {transcription.duration_seconds != null && (
          <span className="ml-auto shrink-0 text-xs text-zinc-500">
            {formatDuration(transcription.duration_seconds)}
          </span>
        )}
        {transcription.sentiment && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              SENTIMENT_STYLES[transcription.sentiment]
            )}
          >
            {transcription.sentiment}
          </span>
        )}
        {transcription.action_items.length > 0 && (
          <span className="shrink-0 text-xs text-amber-400">
            {transcription.action_items.filter((i) => !i.done).length} action items
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800/50 px-4 py-3">
        <Mic className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-medium text-zinc-200">Voice Note</span>
        {transcription.duration_seconds != null && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock className="h-3 w-3" />
            {formatDuration(transcription.duration_seconds)}
          </span>
        )}
        {transcription.sentiment && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium",
              SENTIMENT_STYLES[transcription.sentiment]
            )}
          >
            {transcription.sentiment}
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-500">{timeAgo(transcription.created_at)}</span>
        {compact && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              {transcription.transcription_status === "pending"
                ? "Queued for transcription..."
                : "Transcribing..."}
            </span>
          </div>
        )}

        {isFailed && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>{transcription.error_message || "Transcription failed"}</span>
            {onRetranscribe && (
              <button
                type="button"
                onClick={() => onRetranscribe(transcription.id)}
                className="ml-auto flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}

        {isCompleted && transcription.transcription_text && (
          <>
            {/* Summary */}
            {transcription.summary && (
              <p className="text-sm font-medium text-zinc-200">{transcription.summary}</p>
            )}

            {/* Full transcription */}
            <p className="text-sm leading-relaxed text-zinc-400">
              {transcription.transcription_text}
            </p>

            {/* Language + Confidence */}
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {transcription.language && (
                <span>Language: {transcription.language.toUpperCase()}</span>
              )}
              {transcription.confidence_score != null && (
                <span>
                  Confidence: {Math.round(transcription.confidence_score * 100)}%
                </span>
              )}
            </div>
          </>
        )}

        {/* Action Items */}
        {transcription.action_items.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Action Items
            </span>
            {transcription.action_items.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleActionToggle(i)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-800/50"
              >
                {item.done ? (
                  <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                )}
                <span className={cn("text-zinc-300", item.done && "line-through text-zinc-500")}>
                  {item.text}
                </span>
                <span className={cn("ml-auto shrink-0 text-xs", PRIORITY_STYLES[item.priority])}>
                  {item.priority}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Link buttons */}
        <div className="flex items-center gap-2 pt-1">
          {!transcription.linked_deal_id && onLinkDeal && (
            <button
              type="button"
              onClick={() => onLinkDeal(transcription.id)}
              className="flex items-center gap-1 rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              <Link className="h-3 w-3" />
              Link to Deal
            </button>
          )}
          {transcription.deal && (
            <span className="flex items-center gap-1 text-xs text-violet-400">
              <Link className="h-3 w-3" />
              {transcription.deal.deal_name}
            </span>
          )}
          {!transcription.linked_contact_id && onLinkContact && (
            <button
              type="button"
              onClick={() => onLinkContact(transcription.id)}
              className="flex items-center gap-1 rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              <User className="h-3 w-3" />
              Link to Contact
            </button>
          )}
          {transcription.contact && (
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <User className="h-3 w-3" />
              {transcription.contact.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export type { VoiceTranscription, ActionItem, VoiceTranscriptionCardProps };
