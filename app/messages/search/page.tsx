"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Filter, Calendar, MessageSquare, User, Clock,
  Loader2, Database, ChevronDown, ExternalLink, Image, Video,
  FileText, Mic, Sticker,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: number;
  chat_id: number;
  message_id: number;
  sender_id: number | null;
  sender_name: string | null;
  message_text: string | null;
  message_type: string;
  has_media: boolean;
  reply_to_message_id: number | null;
  sent_at: string;
}

interface SearchState {
  query: string;
  chatId: string;
  sender: string;
  messageType: string;
  dateAfter: string;
  dateBefore: string;
}

const MESSAGE_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "text", label: "Text" },
  { value: "photo", label: "Photos" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Documents" },
  { value: "voice", label: "Voice" },
  { value: "sticker", label: "Stickers" },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <MessageSquare className="h-3.5 w-3.5" />,
  photo: <Image className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  document: <FileText className="h-3.5 w-3.5" />,
  voice: <Mic className="h-3.5 w-3.5" />,
  sticker: <Sticker className="h-3.5 w-3.5" />,
};

export default function MessageSearchPage() {
  const [indexingEnabled, setIndexingEnabled] = React.useState<boolean | null>(null);
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  const [search, setSearch] = React.useState<SearchState>({
    query: "",
    chatId: "",
    sender: "",
    messageType: "",
    dateAfter: "",
    dateBefore: "",
  });

  // Check indexing status on mount
  React.useEffect(() => {
    checkIndexingStatus();
  }, []);

  async function checkIndexingStatus() {
    try {
      const res = await fetch("/api/messages/index/config");
      if (res.ok) {
        const data = await res.json();
        setIndexingEnabled(data.data?.indexing_enabled ?? false);
      }
    } catch {
      setIndexingEnabled(false);
    }
  }

  async function executeSearch(cursor?: string) {
    if (!search.query.trim() && !search.chatId && !search.sender) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.query) params.set("q", search.query);
      if (search.chatId) params.set("chat_id", search.chatId);
      if (search.sender) params.set("sender", search.sender);
      if (search.messageType) params.set("type", search.messageType);
      if (search.dateAfter) params.set("after", search.dateAfter);
      if (search.dateBefore) params.set("before", search.dateBefore);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");

      const res = await fetch(`/api/messages/index?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (cursor) {
          setResults((prev) => [...prev, ...(data.data ?? [])]);
        } else {
          setResults(data.data ?? []);
        }
        setTotal(data.total ?? 0);
        setNextCursor(data.next_cursor);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResults([]);
    setNextCursor(null);
    executeSearch();
  }

  /** Highlight search terms in text. */
  function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;

    const terms = query.trim().split(/\s+/).filter(Boolean);
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
    const parts = text.split(pattern);

    return parts.map((part, i) => {
      const isMatch = terms.some((t) => part.toLowerCase() === t.toLowerCase());
      return isMatch ? (
        <mark key={i} className="bg-amber-500/30 text-amber-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      );
    });
  }

  // Loading state
  if (indexingEnabled === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  // Not enabled — show prompt
  if (!indexingEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <Database className="h-12 w-12 text-zinc-600 mb-4" />
        <h1 className="text-xl font-semibold text-zinc-200">Message Search</h1>
        <p className="mt-2 text-sm text-zinc-400 max-w-md">
          Message search requires server-side indexing to be enabled.
          This is an opt-in feature that stores encrypted message indexes on the server.
        </p>
        <Button
          className="mt-4"
          onClick={() => window.location.href = "/settings/message-indexing"}
        >
          Go to Settings to Enable
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Message Search</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Full-text search across your indexed Telegram messages.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search messages..."
              value={search.query}
              onChange={(e) => setSearch((s) => ({ ...s, query: e.target.value }))}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "bg-zinc-800")}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filters
            <ChevronDown className={cn("h-3 w-3 ml-1 transition-transform", showFilters && "rotate-180")} />
          </Button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Chat ID</label>
              <Input
                placeholder="e.g. -1001234567"
                value={search.chatId}
                onChange={(e) => setSearch((s) => ({ ...s, chatId: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Sender Name</label>
              <Input
                placeholder="e.g. John"
                value={search.sender}
                onChange={(e) => setSearch((s) => ({ ...s, sender: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">After Date</label>
              <Input
                type="date"
                value={search.dateAfter}
                onChange={(e) => setSearch((s) => ({ ...s, dateAfter: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Before Date</label>
              <Input
                type="date"
                value={search.dateBefore}
                onChange={(e) => setSearch((s) => ({ ...s, dateBefore: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Message Type</label>
              <div className="flex flex-wrap gap-1">
                {MESSAGE_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSearch((s) => ({ ...s, messageType: opt.value }))}
                    className={cn(
                      "px-2 py-1 text-xs rounded border transition-colors",
                      search.messageType === opt.value
                        ? "border-zinc-500 bg-zinc-700 text-zinc-100"
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm text-zinc-500 mb-3">
            {total.toLocaleString()} result{total !== 1 ? "s" : ""} found
          </div>

          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Sender and metadata */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-zinc-500">
                        {TYPE_ICONS[result.message_type] ?? <MessageSquare className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        {result.sender_name ?? `User ${result.sender_id ?? "Unknown"}`}
                      </span>
                      <span className="text-xs text-zinc-600">in</span>
                      <span className="text-xs text-zinc-400 font-mono">
                        {result.chat_id}
                      </span>
                    </div>

                    {/* Message text with highlighting */}
                    {result.message_text && (
                      <p className="text-sm text-zinc-300 line-clamp-3">
                        {highlightText(result.message_text, search.query)}
                      </p>
                    )}

                    {result.has_media && !result.message_text && (
                      <p className="text-sm text-zinc-500 italic">
                        [{result.message_type} message]
                      </p>
                    )}

                    {result.reply_to_message_id && (
                      <span className="text-xs text-zinc-600 mt-1 block">
                        Reply to message #{result.reply_to_message_id}
                      </span>
                    )}
                  </div>

                  {/* Timestamp and link */}
                  <div className="text-right shrink-0">
                    <div className="text-xs text-zinc-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(result.sent_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-zinc-600">
                      {new Date(result.sent_at).toLocaleTimeString()}
                    </div>
                    <a
                      href={`https://t.me/c/${Math.abs(result.chat_id).toString().replace(/^100/, "")}/${result.message_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open in TG
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load More */}
          {nextCursor && (
            <div className="pt-4 text-center">
              <Button
                variant="ghost"
                onClick={() => executeSearch(nextCursor)}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Load More
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state after search */}
      {!loading && results.length === 0 && search.query && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400">No messages found matching your search.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Try different keywords or adjust your filters.
          </p>
        </div>
      )}
    </div>
  );
}

/** Escape special regex characters in a string. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
