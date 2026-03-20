"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Gmail advanced search operators
// https://support.google.com/mail/answer/7190
const FILTER_OPERATORS = [
  { key: "from", label: "From", placeholder: "sender@example.com", icon: "←" },
  { key: "to", label: "To", placeholder: "recipient@example.com", icon: "→" },
  { key: "subject", label: "Subject", placeholder: "meeting notes", icon: "◉" },
  { key: "has", label: "Has", placeholder: "attachment, drive, youtube", icon: "📎" },
  { key: "filename", label: "Filename", placeholder: "report.pdf", icon: "📄" },
  { key: "label", label: "Label", placeholder: "INBOX, STARRED", icon: "🏷" },
  { key: "in", label: "In", placeholder: "inbox, sent, trash, anywhere", icon: "📂" },
  { key: "is", label: "Is", placeholder: "unread, starred, important", icon: "⚡" },
  { key: "after", label: "After", placeholder: "2024/01/15", icon: "📅" },
  { key: "before", label: "Before", placeholder: "2024/03/01", icon: "📅" },
  { key: "older_than", label: "Older than", placeholder: "7d, 2m, 1y", icon: "⏱" },
  { key: "newer_than", label: "Newer than", placeholder: "3d, 1w", icon: "⏱" },
  { key: "size", label: "Size >", placeholder: "5m (bytes)", icon: "📦" },
  { key: "category", label: "Category", placeholder: "primary, social, promotions", icon: "📋" },
] as const;

type FilterChip = {
  id: string;
  operator: string;
  value: string;
};

type AdvancedSearchProps = {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  initialQuery?: string;
};

export function AdvancedSearch({ open, onClose, onSearch, initialQuery }: AdvancedSearchProps) {
  const [freeText, setFreeText] = React.useState(initialQuery ?? "");
  const [chips, setChips] = React.useState<FilterChip[]>([]);
  const [showOperators, setShowOperators] = React.useState(false);
  const [operatorQuery, setOperatorQuery] = React.useState("");
  const [selectedOpIndex, setSelectedOpIndex] = React.useState(0);
  const [activeChipOp, setActiveChipOp] = React.useState<string | null>(null);
  const [chipValue, setChipValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const chipInputRef = React.useRef<HTMLInputElement>(null);

  // Recent searches from localStorage
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      try {
        const stored = localStorage.getItem("supracrm_recent_searches");
        setRecentSearches(stored ? JSON.parse(stored) : []);
      } catch { /* empty */ }
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setShowOperators(false);
      setActiveChipOp(null);
      setOperatorQuery("");
      setChipValue("");
    }
  }, [open]);

  // Parse initial query into chips on open
  React.useEffect(() => {
    if (!open || !initialQuery) return;
    const parsed = parseQueryToChips(initialQuery);
    setChips(parsed.chips);
    setFreeText(parsed.freeText);
  }, [open, initialQuery]);

  const filteredOperators = React.useMemo(() => {
    if (!operatorQuery) return FILTER_OPERATORS;
    const q = operatorQuery.toLowerCase();
    return FILTER_OPERATORS.filter(
      (op) => op.key.includes(q) || op.label.toLowerCase().includes(q) || op.placeholder.includes(q)
    );
  }, [operatorQuery]);

  function buildQuery(): string {
    const parts: string[] = [];
    for (const chip of chips) {
      if (chip.value.includes(" ")) {
        parts.push(`${chip.operator}:(${chip.value})`);
      } else {
        parts.push(`${chip.operator}:${chip.value}`);
      }
    }
    if (freeText.trim()) parts.push(freeText.trim());
    return parts.join(" ");
  }

  function executeSearch() {
    const query = buildQuery();
    if (!query) return;

    // Save to recent
    const updated = [query, ...recentSearches.filter((r) => r !== query)].slice(0, 10);
    setRecentSearches(updated);
    try { localStorage.setItem("supracrm_recent_searches", JSON.stringify(updated)); } catch { /* empty */ }

    onSearch(query);
    onClose();
  }

  function addChip(operator: string) {
    setActiveChipOp(operator);
    setShowOperators(false);
    setOperatorQuery("");
    setTimeout(() => chipInputRef.current?.focus(), 50);
  }

  function commitChip() {
    if (!activeChipOp || !chipValue.trim()) {
      setActiveChipOp(null);
      setChipValue("");
      return;
    }
    setChips((prev) => [...prev, { id: crypto.randomUUID(), operator: activeChipOp, value: chipValue.trim() }]);
    setActiveChipOp(null);
    setChipValue("");
    inputRef.current?.focus();
  }

  function removeChip(id: string) {
    setChips((prev) => prev.filter((c) => c.id !== id));
  }

  function clearRecent(query: string) {
    const updated = recentSearches.filter((r) => r !== query);
    setRecentSearches(updated);
    try { localStorage.setItem("supracrm_recent_searches", JSON.stringify(updated)); } catch { /* empty */ }
  }

  function handleMainKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch();
    } else if (e.key === "Escape") {
      if (showOperators) {
        setShowOperators(false);
      } else {
        onClose();
      }
    } else if (e.key === "Backspace" && freeText === "" && chips.length > 0) {
      // Remove last chip on backspace in empty field
      setChips((prev) => prev.slice(0, -1));
    } else if (e.key === "Tab" || (e.key === ":" && freeText.length > 0)) {
      // Check if current text matches an operator
      const text = freeText.trim().toLowerCase();
      const matchedOp = FILTER_OPERATORS.find((op) => op.key === text);
      if (matchedOp) {
        e.preventDefault();
        setFreeText("");
        addChip(matchedOp.key);
      }
    }
  }

  function handleOperatorKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedOpIndex((i) => Math.min(i + 1, filteredOperators.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedOpIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filteredOperators[selectedOpIndex]) {
      e.preventDefault();
      addChip(filteredOperators[selectedOpIndex].key);
    } else if (e.key === "Escape") {
      setShowOperators(false);
    }
  }

  function handleChipKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitChip();
    } else if (e.key === "Escape") {
      setActiveChipOp(null);
      setChipValue("");
      inputRef.current?.focus();
    }
  }

  if (!open) return null;

  const activeOpMeta = activeChipOp
    ? FILTER_OPERATORS.find((op) => op.key === activeChipOp)
    : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-fade-in"
        style={{ backgroundColor: "hsl(var(--surface-4))" }}
      >
        {/* Search bar */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 flex-wrap">
            <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* Active filter chips */}
            {chips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/10 pl-2 pr-1 py-0.5 text-xs"
              >
                <span className="text-primary/70">{chip.operator}:</span>
                <span className="text-primary">{chip.value}</span>
                <button
                  onClick={() => removeChip(chip.id)}
                  className="ml-0.5 text-primary/40 hover:text-primary transition p-0.5"
                >
                  <XIcon className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}

            {/* Active chip value input */}
            {activeChipOp && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-0.5">
                <span className="text-[10px] text-primary/70">{activeChipOp}:</span>
                <input
                  ref={chipInputRef}
                  value={chipValue}
                  onChange={(e) => setChipValue(e.target.value)}
                  onKeyDown={handleChipKeyDown}
                  onBlur={commitChip}
                  placeholder={activeOpMeta?.placeholder ?? "value"}
                  className="bg-transparent text-xs text-primary outline-none w-32 placeholder:text-primary/30"
                />
              </span>
            )}

            {/* Main text input */}
            {!activeChipOp && (
              <input
                ref={inputRef}
                value={freeText}
                onChange={(e) => {
                  setFreeText(e.target.value);
                  // Show operator suggestions when typing
                  if (e.target.value && !showOperators) {
                    const text = e.target.value.trim().toLowerCase();
                    if (FILTER_OPERATORS.some((op) => op.key.startsWith(text))) {
                      setShowOperators(true);
                      setOperatorQuery(text);
                    }
                  }
                }}
                onKeyDown={handleMainKeyDown}
                placeholder={chips.length > 0 ? "Add keywords..." : "Search emails... (type from:, to:, subject: for filters)"}
                className="flex-1 min-w-[200px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            )}

            {/* Filter button */}
            <button
              onClick={() => { setShowOperators(!showOperators); setOperatorQuery(""); setSelectedOpIndex(0); }}
              className={cn(
                "rounded-lg p-1.5 transition shrink-0",
                showOperators ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
              title="Add filter"
            >
              <FilterIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Live query preview */}
          {(chips.length > 0 || freeText) && (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/50 font-mono truncate flex-1">
                {buildQuery()}
              </p>
              <button
                onClick={executeSearch}
                className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition ml-2 shrink-0"
              >
                Search
              </button>
            </div>
          )}
        </div>

        {/* Operator dropdown */}
        {showOperators && (
          <div className="border-b border-white/10">
            <div className="px-3 py-2">
              <input
                value={operatorQuery}
                onChange={(e) => { setOperatorQuery(e.target.value); setSelectedOpIndex(0); }}
                onKeyDown={handleOperatorKeyDown}
                placeholder="Filter by..."
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
                autoFocus
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1">
              {filteredOperators.map((op, i) => (
                <button
                  key={op.key}
                  onClick={() => addChip(op.key)}
                  onMouseEnter={() => setSelectedOpIndex(i)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    selectedOpIndex === i ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
                  )}
                >
                  <span className="text-sm w-5 text-center">{op.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground font-medium">{op.label}</span>
                      <span className="text-[10px] text-muted-foreground/50 font-mono">{op.key}:</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 truncate">
                      e.g. {op.key}:{op.placeholder.split(",")[0].trim()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick filter presets */}
        {!showOperators && chips.length === 0 && !freeText && (
          <div className="p-3 space-y-3">
            {/* Preset filters */}
            <div>
              <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5">Quick filters</p>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_FILTERS.map((qf) => (
                  <button
                    key={qf.label}
                    onClick={() => { onSearch(qf.query); onClose(); }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="text-sm">{qf.icon}</span>
                    <div>
                      <p className="text-xs text-foreground">{qf.label}</p>
                      <p className="text-[10px] text-muted-foreground/50 font-mono">{qf.query}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div>
                <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5">Recent</p>
                <div className="space-y-0.5">
                  {recentSearches.map((q) => (
                    <div key={q} className="flex items-center gap-2 group">
                      <button
                        onClick={() => { onSearch(q); onClose(); }}
                        className="flex-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-white/[0.05] transition-colors min-w-0"
                      >
                        <ClockIcon className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{q}</span>
                      </button>
                      <button
                        onClick={() => clearRecent(q)}
                        className="text-muted-foreground/20 hover:text-muted-foreground transition opacity-0 group-hover:opacity-100 p-1"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="border-t border-white/5 pt-2">
              <p className="text-[10px] text-muted-foreground/30">
                Type a filter name (from:, to:, subject:, has:) or just search freely. Filters use Gmail search syntax.
              </p>
            </div>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-[10px] text-muted-foreground/40">
          <div className="flex items-center gap-3">
            <span><kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">Enter</kbd> Search</span>
            <span><kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">Tab</kbd> Apply filter</span>
            <span><kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">Esc</kbd> Close</span>
          </div>
          <span>{chips.length > 0 ? `${chips.length} filter${chips.length !== 1 ? "s" : ""}` : ""}</span>
        </div>
      </div>
    </div>
  );
}

// ── Quick filter presets ──────────────────────────────────

const QUICK_FILTERS = [
  { icon: "📎", label: "Has attachment", query: "has:attachment" },
  { icon: "⭐", label: "Starred", query: "is:starred" },
  { icon: "📩", label: "Unread", query: "is:unread" },
  { icon: "📤", label: "Sent by me", query: "in:sent" },
  { icon: "📅", label: "This week", query: "newer_than:7d" },
  { icon: "📆", label: "This month", query: "newer_than:30d" },
  { icon: "💬", label: "Direct (no CC)", query: "-cc:me" },
  { icon: "📂", label: "Drafts", query: "in:draft" },
];

// ── Parse existing query string back into chips ──────────

function parseQueryToChips(query: string): { chips: FilterChip[]; freeText: string } {
  const chips: FilterChip[] = [];
  // Match operator:value or operator:(value with spaces)
  const regex = /(\w+):(?:\(([^)]+)\)|(\S+))/g;
  let match;
  let remaining = query;

  while ((match = regex.exec(query)) !== null) {
    const operator = match[1];
    const value = match[2] ?? match[3];
    if (FILTER_OPERATORS.some((op) => op.key === operator)) {
      chips.push({ id: crypto.randomUUID(), operator, value });
      remaining = remaining.replace(match[0], "");
    }
  }

  return { chips, freeText: remaining.trim() };
}

// ── Inline SVGs ──────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}

function FilterIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
}

function XIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>;
}

function ClockIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
