"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Save, Tag, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useThreadContext } from "@/lib/plugins/thread-context";
import { EmailTagsPanel } from "./email-tags-panel";

interface AISummaryData {
  summary: string;
  actionItems: string[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  keyDecisions: string[];
  suggestedTags: string[];
}

const SENTIMENT_CONFIG = {
  positive: { color: "text-green-400", bg: "bg-green-500/10", label: "Positive" },
  neutral: { color: "text-blue-400", bg: "bg-blue-500/10", label: "Neutral" },
  negative: { color: "text-red-400", bg: "bg-red-500/10", label: "Negative" },
  mixed: { color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Mixed" },
};

export function AISummaryPanel() {
  const { messages, subject, threadId, dealId } = useThreadContext();
  const [data, setData] = React.useState<AISummaryData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const canSummarize = messages && messages.length >= 1;

  // Auto-trigger summary when messages change (new thread selected)
  const prevMessagesRef = React.useRef(messages);
  React.useEffect(() => {
    if (messages && messages.length >= 1 && messages !== prevMessagesRef.current) {
      prevMessagesRef.current = messages;
      setData(null);
      setError(null);
      // Trigger summarize after a short debounce
      const timer = setTimeout(() => {
        handleSummarize();
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function handleSummarize() {
    if (!messages || messages.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/plugins/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, subject }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to generate summary");
        return;
      }

      setData(json.data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToDeal() {
    if (!data || !dealId) return;

    setSaving(true);
    try {
      const noteContent = [
        `**AI Thread Summary** (${new Date().toLocaleDateString()})`,
        "",
        data.summary,
        "",
        data.actionItems.length > 0 ? "**Action Items:**" : "",
        ...data.actionItems.map((item) => `- ${item}`),
        "",
        data.keyDecisions.length > 0 ? "**Key Decisions:**" : "",
        ...data.keyDecisions.map((d) => `- ${d}`),
        "",
        `Sentiment: ${data.sentiment}`,
      ].filter(Boolean).join("\n");

      const res = await fetch(`/api/deals/${dealId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteContent }),
      });

      if (res.ok) {
        toast("Summary saved to deal notes");
      } else {
        toast.error("Failed to save to deal");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <Sparkles className="h-8 w-8 opacity-20" />
        <p className="text-xs">Select a thread to generate an AI summary</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Generate button (if no data yet) */}
      {!data && !loading && (
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="text-xs text-muted-foreground">
            {messages.length} messages in thread
          </p>
          <button
            onClick={handleSummarize}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate Summary
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Analyzing thread...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400">{error}</span>
        </div>
      )}

      {/* Summary result */}
      {data && (
        <>
          {/* Sentiment badge */}
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
              SENTIMENT_CONFIG[data.sentiment]?.bg ?? "bg-white/5",
              SENTIMENT_CONFIG[data.sentiment]?.color ?? "text-muted-foreground"
            )}>
              {SENTIMENT_CONFIG[data.sentiment]?.label ?? data.sentiment}
            </span>
            {subject && (
              <span className="text-[10px] text-muted-foreground truncate">{subject}</span>
            )}
          </div>

          {/* Summary text */}
          <p className="text-xs text-foreground leading-relaxed">{data.summary}</p>

          {/* Action items */}
          {data.actionItems.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Action Items
              </h4>
              <div className="space-y-1">
                {data.actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                    <span className="text-xs text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key decisions */}
          {data.keyDecisions.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Key Decisions
              </h4>
              <div className="space-y-1">
                {data.keyDecisions.map((decision, i) => (
                  <p key={i} className="text-xs text-muted-foreground">- {decision}</p>
                ))}
              </div>
            </div>
          )}

          {/* Suggested tags */}
          {data.suggestedTags.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Suggested Tags
              </h4>
              <div className="flex flex-wrap gap-1">
                {data.suggestedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-white/5 text-muted-foreground border border-white/10"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            {dealId && (
              <button
                onClick={handleSaveToDeal}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {saving ? "Saving..." : "Save to Deal Notes"}
              </button>
            )}
            <button
              onClick={handleSummarize}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            >
              <Sparkles className="h-3 w-3" />
              Regenerate
            </button>
          </div>
        </>
      )}

      {/* Tags section (merged from email-tags panel) */}
      {threadId && (
        <div className="border-t border-white/5 pt-3 mt-1">
          <EmailTagsPanel />
        </div>
      )}
    </div>
  );
}
