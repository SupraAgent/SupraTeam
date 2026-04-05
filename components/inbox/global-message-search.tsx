'use client';

import * as React from 'react';
import { Search, MessageSquare, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn, timeAgo } from '@/lib/utils';

interface SearchResult {
  message_text: string | null;
  sender_name: string | null;
  chat_id: number;
  chat_title: string;
  chat_type: string;
  message_date: string;
  rank: number;
}

interface GlobalMessageSearchProps {
  onSelectChat: (chatId: number) => void;
}

/**
 * Cross-conversation full-text message search.
 * Replaces the conversation list when in "search messages" mode.
 */
export function GlobalMessageSearch({ onSelectChat }: GlobalMessageSearchProps) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const LIMIT = 20;

  // Focus input on mount
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fetchResults = React.useCallback(
    async (searchQuery: string, searchOffset: number, append: boolean) => {
      if (searchQuery.length < 2) {
        if (!append) {
          setResults([]);
          setHasSearched(false);
          setError(null);
        }
        return;
      }

      // Abort previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams({
          q: searchQuery,
          limit: String(LIMIT),
          offset: String(searchOffset),
        });

        const res = await fetch(`/api/messages/search?${params}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Search failed' }));
          setError(body.error ?? 'Search failed');
          return;
        }

        const body = await res.json();
        const newResults: SearchResult[] = body.data ?? [];

        if (append) {
          setResults((prev) => [...prev, ...newResults]);
        } else {
          setResults(newResults);
        }
        setHasMore(body.has_more ?? false);
        setOffset(searchOffset + newResults.length);
        setHasSearched(true);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Search failed. Please try again.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Debounced search on query change
  React.useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      setOffset(0);
      fetchResults(query.trim(), 0, false);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query, fetchResults]);

  // Clean up abort controller on unmount
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchResults(query.trim(), offset, true);
    }
  };

  /**
   * Highlight matching substrings in the message text.
   * Splits the query into words and wraps matches in a styled span.
   */
  const highlightMatch = (text: string, q: string): React.ReactNode => {
    if (!q.trim()) return text;

    const words = q
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (words.length === 0) return text;

    const splitRegex = new RegExp(`(${words.join('|')})`, 'gi');
    const testRegex = new RegExp(`^(?:${words.join('|')})$`, 'i');
    const parts = text.split(splitRegex);

    return parts.map((part, i) =>
      testRegex.test(part) ? (
        <mark key={i} className="bg-primary/30 text-foreground rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  /** Truncate text around the first match for a compact snippet. */
  const getSnippet = (text: string, q: string, maxLen = 120): string => {
    const lower = text.toLowerCase();
    const firstWord = q.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const idx = firstWord ? lower.indexOf(firstWord) : -1;

    if (idx === -1 || text.length <= maxLen) {
      return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
    }

    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, start + maxLen);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    return prefix + text.slice(start, end) + suffix;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-2 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all messages..."
            className="pl-8 h-8 text-xs"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto thin-scroll">
        {error && (
          <div className="p-4 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && !loading && !hasSearched && (
          <div className="p-6 text-center">
            <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">
              Search across all indexed Telegram messages.
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/50">
              Type at least 2 characters to search.
            </p>
          </div>
        )}

        {!error && !loading && hasSearched && results.length === 0 && (
          <div className="p-6 text-center">
            <Search className="mx-auto h-6 w-6 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">
              No messages matching &ldquo;{query}&rdquo;
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="divide-y divide-white/5">
            {results.map((result, idx) => (
              <button
                key={`${result.chat_id}-${result.message_date}-${idx}`}
                onClick={() => onSelectChat(result.chat_id)}
                className="w-full text-left px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
              >
                {/* Chat title + timestamp */}
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[11px] font-medium text-foreground truncate">
                    {result.chat_title}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 shrink-0">
                    {timeAgo(result.message_date)}
                  </span>
                </div>

                {/* Sender */}
                {result.sender_name && (
                  <p className="text-[10px] text-primary/70 mb-0.5 truncate">
                    {result.sender_name}
                  </p>
                )}

                {/* Message snippet with highlights */}
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {result.message_text
                    ? highlightMatch(
                        getSnippet(result.message_text, query),
                        query
                      )
                    : '(no text)'}
                </p>
              </button>
            ))}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-2.5 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {loadingMore ? (
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Load more results'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
