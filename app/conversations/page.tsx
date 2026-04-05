"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  Brain,
  Clock,
  Frown,
  Loader2,
  Meh,
  MessageCircle,
  RefreshCw,
  Smile,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Zap,
} from "lucide-react";

interface Conversation {
  chat_id: number;
  group_name: string;
  group_type: string;
  message_count: number;
  latest_at: string | null;
  messages: Array<{
    message_text: string;
    sender_name: string;
    sent_at: string;
    is_from_bot: boolean;
  }>;
}

interface Highlight {
  id: string;
  deal_id: string | null;
  contact_id: string | null;
  sender_name: string;
  message_preview: string;
  highlight_type: string;
  priority: string | null;
  sentiment: string | null;
  message_count: number;
  created_at: string;
  triage_category: string | null;
  triage_urgency: string | null;
  triage_summary: string | null;
}

interface BriefingData {
  summary: string;
  sentimentOverview: { positive: number; neutral: number; negative: number };
  topics: string[];
  attentionNeeded: Array<{
    groupName: string;
    reason: string;
    sentiment: string;
  }>;
}

export default function ConversationIntelligencePage() {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [highlights, setHighlights] = React.useState<Highlight[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [briefing, setBriefing] = React.useState<BriefingData | null>(null);
  const [briefingLoading, setBriefingLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // Derive sentiment from highlights
  const sentimentCounts = React.useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    for (const h of highlights) {
      if (h.sentiment === "positive") counts.positive++;
      else if (h.sentiment === "negative") counts.negative++;
      else counts.neutral++;
    }
    return counts;
  }, [highlights]);

  const totalSentiment =
    sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative;

  // Conversations needing attention: no recent bot replies + high volume
  const needsAttention = React.useMemo(() => {
    return conversations
      .filter((c) => {
        if (!c.latest_at) return false;
        const hoursSinceLatest =
          (Date.now() - new Date(c.latest_at).getTime()) / (1000 * 60 * 60);
        // Active conversation with no bot response in recent messages
        const recentMessages = c.messages.slice(0, 5);
        const hasRecentBotReply = recentMessages.some((m) => m.is_from_bot);
        return (
          c.message_count >= 3 && !hasRecentBotReply && hoursSinceLatest < 48
        );
      })
      .slice(0, 5);
  }, [conversations]);

  // Extract topics from message content
  const topTopics = React.useMemo(() => {
    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      "the", "and", "for", "are", "but", "not", "you", "all", "can", "her",
      "was", "one", "our", "out", "has", "his", "how", "its", "let", "may",
      "who", "did", "get", "got", "had", "him", "this", "that", "with",
      "have", "from", "will", "been", "they", "than", "what", "when",
      "your", "said", "each", "make", "like", "just", "over", "such",
      "take", "into", "some", "them", "than", "then", "very", "about",
      "would", "there", "their", "which", "could", "other", "were", "more",
      "after", "also", "made", "many", "before", "here", "should", "where",
    ]);

    for (const conv of conversations) {
      for (const msg of conv.messages.slice(0, 10)) {
        if (!msg.message_text || msg.is_from_bot) continue;
        const words = msg.message_text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !stopWords.has(w));
        for (const word of words) {
          wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
        }
      }
    }

    return [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word, count]) => ({ word, count }));
  }, [conversations]);

  // Highlighted conversations with negative sentiment
  const negativeHighlights = React.useMemo(() => {
    return highlights.filter((h) => h.sentiment === "negative").slice(0, 5);
  }, [highlights]);

  const fetchData = React.useCallback(async () => {
    try {
      const [inboxRes, highlightsRes] = await Promise.all([
        fetch("/api/inbox?limit=30"),
        fetch("/api/highlights"),
      ]);

      if (inboxRes.ok) {
        const data = await inboxRes.json();
        setConversations(data.conversations ?? []);
      }
      if (highlightsRes.ok) {
        const data = await highlightsRes.json();
        setHighlights(data.highlights ?? []);
      }
    } catch {
      toast.error("Failed to load conversation data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  async function generateBriefing() {
    if (conversations.length === 0) {
      toast.error("No conversations to analyze");
      return;
    }

    setBriefingLoading(true);

    // Build a summary of recent conversations for AI analysis
    const conversationSummary = conversations.slice(0, 15).map((c) => ({
      group: c.group_name,
      messageCount: c.message_count,
      latestAt: c.latest_at,
      recentMessages: c.messages
        .slice(0, 5)
        .map((m) => `${m.sender_name}: ${m.message_text?.slice(0, 100) ?? ""}`)
        .join("\n"),
    }));

    const highlightSummary = highlights.slice(0, 10).map((h) => ({
      sender: h.sender_name,
      preview: h.message_preview,
      sentiment: h.sentiment,
      type: h.highlight_type,
      priority: h.priority,
      triage: h.triage_summary,
    }));

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Analyze these recent Telegram CRM conversations and provide a daily briefing. Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "summary": "2-3 sentence executive summary of conversation activity",
  "sentimentOverview": { "positive": <number>, "neutral": <number>, "negative": <number> },
  "topics": ["topic1", "topic2", ...up to 6 key topics being discussed],
  "attentionNeeded": [{"groupName": "name", "reason": "why it needs attention", "sentiment": "positive|neutral|negative"}]
}

Recent conversations (${conversations.length} total):
${JSON.stringify(conversationSummary, null, 2)}

Highlights:
${JSON.stringify(highlightSummary, null, 2)}`,
            },
          ],
          context: { page: "/conversations" },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "AI request failed");
      }

      const data = await res.json();
      const reply: string = data.data?.reply ?? "";

      // Try to parse the AI response as JSON
      try {
        // Try direct parse first
        let parsed: BriefingData | null = null;
        try {
          parsed = JSON.parse(reply);
        } catch {
          // Try extracting JSON from the response
          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        }

        if (
          parsed &&
          typeof parsed.summary === "string" &&
          parsed.sentimentOverview
        ) {
          setBriefing(parsed);
          toast.success("Briefing generated");
        } else {
          throw new Error("Invalid AI response structure");
        }
      } catch {
        // Fallback: create a basic briefing from the reply text
        setBriefing({
          summary: reply.slice(0, 500),
          sentimentOverview: sentimentCounts,
          topics: topTopics.slice(0, 6).map((t) => t.word),
          attentionNeeded: [],
        });
        toast.success("Briefing generated (basic)");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to generate briefing";
      toast.error(message);
    } finally {
      setBriefingLoading(false);
    }
  }

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleRefresh() {
    setRefreshing(true);
    setBriefing(null);
    fetchData();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-72 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
        <div className="h-48 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
            <Brain className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Conversation Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered insights across {conversations.length} Telegram
              conversations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn(
                "mr-1 h-3.5 w-3.5",
                refreshing && "animate-spin"
              )}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={generateBriefing}
            disabled={briefingLoading || conversations.length === 0}
            className="bg-purple-600 hover:bg-purple-500 text-white"
          >
            {briefingLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            Generate Briefing
          </Button>
        </div>
      </div>

      {/* AI Briefing */}
      {briefing && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-purple-300">
              AI Daily Briefing
            </h2>
          </div>
          <p className="text-sm text-foreground leading-relaxed mb-3">
            {briefing.summary}
          </p>

          {/* AI-detected sentiment */}
          {briefing.sentimentOverview && (
            <div className="flex items-center gap-4 mb-3">
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Smile className="h-3.5 w-3.5" />
                {briefing.sentimentOverview.positive} positive
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Meh className="h-3.5 w-3.5" />
                {briefing.sentimentOverview.neutral} neutral
              </span>
              <span className="flex items-center gap-1 text-xs text-red-400">
                <Frown className="h-3.5 w-3.5" />
                {briefing.sentimentOverview.negative} negative
              </span>
            </div>
          )}

          {/* AI-detected topics */}
          {briefing.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {briefing.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* AI attention items */}
          {briefing.attentionNeeded.length > 0 && (
            <div className="space-y-1.5 mt-3 pt-3 border-t border-purple-500/10">
              <p className="text-[10px] text-purple-300/70 uppercase tracking-wider">
                Needs Attention
              </p>
              {briefing.attentionNeeded.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-purple-500/[0.05] px-2.5 py-1.5"
                >
                  <AlertCircle
                    className={cn(
                      "mt-0.5 h-3 w-3 shrink-0",
                      item.sentiment === "negative"
                        ? "text-red-400"
                        : "text-amber-400"
                    )}
                  />
                  <div>
                    <span className="text-xs font-medium text-foreground">
                      {item.groupName}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      {item.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sentiment + Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Total Conversations
            </p>
            <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <p className="text-xl font-semibold mt-1 text-foreground">
            {conversations.length}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            across all TG groups
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Highlights
            </p>
            <Star className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <p className="text-xl font-semibold mt-1 text-amber-400">
            {highlights.length}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            flagged messages
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Needs Response
            </p>
            <Zap className="h-3.5 w-3.5 text-red-400" />
          </div>
          <p className="text-xl font-semibold mt-1 text-red-400">
            {needsAttention.length}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            awaiting reply
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Sentiment
            </p>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          {totalSentiment > 0 ? (
            <>
              <div className="flex items-center gap-1 mt-1.5">
                <div
                  className="h-2 rounded-l-full bg-emerald-500"
                  style={{
                    width: `${(sentimentCounts.positive / totalSentiment) * 100}%`,
                    minWidth: sentimentCounts.positive > 0 ? "4px" : "0",
                  }}
                />
                <div
                  className="h-2 bg-white/20"
                  style={{
                    width: `${(sentimentCounts.neutral / totalSentiment) * 100}%`,
                    minWidth: sentimentCounts.neutral > 0 ? "4px" : "0",
                  }}
                />
                <div
                  className="h-2 rounded-r-full bg-red-500"
                  style={{
                    width: `${(sentimentCounts.negative / totalSentiment) * 100}%`,
                    minWidth: sentimentCounts.negative > 0 ? "4px" : "0",
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                {sentimentCounts.positive}+ / {sentimentCounts.neutral}= /{" "}
                {sentimentCounts.negative}-
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">No data</p>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Conversations needing attention */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Awaiting Response
            </h2>
          </div>
          {needsAttention.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              All conversations are handled.
            </p>
          ) : (
            <div className="space-y-2">
              {needsAttention.map((conv) => {
                const lastMsg = conv.messages[0];
                const hoursSince = conv.latest_at
                  ? Math.round(
                      (Date.now() - new Date(conv.latest_at).getTime()) /
                        (1000 * 60 * 60)
                    )
                  : 0;

                return (
                  <div
                    key={conv.chat_id}
                    className="rounded-lg border border-amber-500/10 bg-amber-500/[0.03] p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                        {conv.group_name}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-amber-400">
                        <Clock className="h-3 w-3" />
                        {hoursSince}h ago
                      </div>
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        <span className="text-foreground/70">
                          {lastMsg.sender_name}:
                        </span>{" "}
                        {lastMsg.message_text?.slice(0, 120) ?? ""}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/60">
                      <span>{conv.message_count} messages</span>
                      <span>{conv.group_type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Key Topics */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Trending Topics
            </h2>
          </div>
          {topTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Not enough message data to extract topics.
            </p>
          ) : (
            <div className="space-y-1.5">
              {topTopics.map((topic) => {
                const maxCount = topTopics[0]?.count ?? 1;
                const barWidth = Math.max(
                  8,
                  Math.round((topic.count / maxCount) * 100)
                );

                return (
                  <div
                    key={topic.word}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs text-foreground w-24 truncate">
                      {topic.word}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500/40"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-6 text-right">
                      {topic.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Negative Sentiment Highlights */}
      {negativeHighlights.length > 0 && (
        <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Frown className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400">
              Negative Sentiment Detected
            </h2>
          </div>
          <div className="space-y-2">
            {negativeHighlights.map((h) => (
              <div
                key={h.id}
                className="flex items-start gap-2 rounded-lg border border-red-500/10 bg-red-500/[0.03] px-3 py-2"
              >
                <Frown className="mt-0.5 h-3 w-3 text-red-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {h.sender_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(h.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {h.triage_summary ?? h.message_preview}
                  </p>
                  {h.triage_urgency && (
                    <span
                      className={cn(
                        "inline-block mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                        h.triage_urgency === "high"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-amber-500/20 text-amber-300"
                      )}
                    >
                      {h.triage_urgency} urgency
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {conversations.length === 0 && highlights.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <Brain className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No conversation data available.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Connect Telegram groups in{" "}
            <a href="/inbox" className="text-blue-400 hover:underline">
              Inbox
            </a>{" "}
            to see AI-powered insights here.
          </p>
        </div>
      )}
    </div>
  );
}
