"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, X, ArrowRight } from "lucide-react";

type SearchResult = {
  deals: { id: string; deal_name: string; board_type: string; stage: { name: string; color: string } | null }[];
  contacts: { id: string; name: string; company: string | null; telegram_username: string | null }[];
  groups: { id: string; group_name: string }[];
};

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult>({ deals: [], contacts: [], groups: [] });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Global keyboard shortcut
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Focus input when opened
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search on query change with AbortController
  React.useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ deals: [], contacts: [], groups: [] });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then(setResults)
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  // Flatten results for keyboard navigation
  const allItems = [
    ...results.deals.map((d) => ({ type: "deal" as const, id: d.id, label: d.deal_name, sub: d.board_type, href: `/pipeline?highlight=${d.id}` })),
    ...results.contacts.map((c) => ({ type: "contact" as const, id: c.id, label: c.name, sub: c.company ?? c.telegram_username ?? "", href: `/contacts` })),
    ...results.groups.map((g) => ({ type: "group" as const, id: g.id, label: g.group_name, sub: "TG Group", href: `/groups` })),
  ];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && allItems[selectedIndex]) {
      e.preventDefault();
      router.push(allItems[selectedIndex].href);
      setOpen(false);
      setQuery("");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/60" onClick={() => { setOpen(false); setQuery(""); }} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[hsl(225,35%,7%)] shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search deals, contacts, groups..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {allItems.length > 0 ? (
          <div className="max-h-[300px] overflow-y-auto p-2">
            {results.deals.length > 0 && (
              <div className="mb-2">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Deals</p>
                {results.deals.map((d, i) => {
                  const idx = i;
                  return (
                    <button
                      key={d.id}
                      onClick={() => { router.push(`/pipeline?highlight=${d.id}`); setOpen(false); setQuery(""); }}
                      className={cn(
                        "flex items-center justify-between w-full rounded-lg px-3 py-2 text-left transition-colors",
                        selectedIndex === idx ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                      )}
                    >
                      <div>
                        <p className="text-sm text-foreground">{d.deal_name}</p>
                        <p className="text-[10px] text-muted-foreground">{d.board_type}{d.stage ? ` / ${d.stage.name}` : ""}</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
                    </button>
                  );
                })}
              </div>
            )}
            {results.contacts.length > 0 && (
              <div className="mb-2">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Contacts</p>
                {results.contacts.map((c, i) => {
                  const idx = results.deals.length + i;
                  return (
                    <button
                      key={c.id}
                      onClick={() => { router.push(`/contacts`); setOpen(false); setQuery(""); }}
                      className={cn(
                        "flex items-center justify-between w-full rounded-lg px-3 py-2 text-left transition-colors",
                        selectedIndex === idx ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                      )}
                    >
                      <div>
                        <p className="text-sm text-foreground">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.company ?? ""}{c.telegram_username ? ` @${c.telegram_username}` : ""}</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
                    </button>
                  );
                })}
              </div>
            )}
            {results.groups.length > 0 && (
              <div>
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">TG Groups</p>
                {results.groups.map((g, i) => {
                  const idx = results.deals.length + results.contacts.length + i;
                  return (
                    <button
                      key={g.id}
                      onClick={() => { router.push(`/groups`); setOpen(false); setQuery(""); }}
                      className={cn(
                        "flex items-center justify-between w-full rounded-lg px-3 py-2 text-left transition-colors",
                        selectedIndex === idx ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                      )}
                    >
                      <p className="text-sm text-foreground">{g.group_name}</p>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : query.length >= 2 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground/50">Type to search across deals, contacts, and groups</div>
        )}
      </div>
    </div>
  );
}
