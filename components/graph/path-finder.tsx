"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PathFinderProps {
  contacts: { id: string; name: string; company: string | null }[];
  onFindPath: (fromId: string, toId: string) => void;
  onClear: () => void;
  pathResult?: string[];
  className?: string;
}

export function PathFinder({ contacts, onFindPath, onClear, pathResult, className }: PathFinderProps) {
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [fromSearch, setFromSearch] = React.useState("");
  const [toSearch, setToSearch] = React.useState("");
  const [showFromDropdown, setShowFromDropdown] = React.useState(false);
  const [showToDropdown, setShowToDropdown] = React.useState(false);

  const filteredFrom = contacts.filter(
    (c) =>
      c.id !== toId &&
      (c.name.toLowerCase().includes(fromSearch.toLowerCase()) ||
        (c.company?.toLowerCase().includes(fromSearch.toLowerCase()) ?? false))
  );

  const filteredTo = contacts.filter(
    (c) =>
      c.id !== fromId &&
      (c.name.toLowerCase().includes(toSearch.toLowerCase()) ||
        (c.company?.toLowerCase().includes(toSearch.toLowerCase()) ?? false))
  );

  const selectedFrom = contacts.find((c) => c.id === fromId);
  const selectedTo = contacts.find((c) => c.id === toId);

  const handleFindPath = () => {
    if (fromId && toId) onFindPath(fromId, toId);
  };

  const handleClear = () => {
    setFromId("");
    setToId("");
    setFromSearch("");
    setToSearch("");
    onClear();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Path Finder
      </h4>

      {/* From contact */}
      <div className="relative">
        <input
          type="text"
          value={fromId ? selectedFrom?.name ?? "" : fromSearch}
          onChange={(e) => {
            setFromSearch(e.target.value);
            setFromId("");
            setShowFromDropdown(true);
          }}
          onFocus={() => setShowFromDropdown(true)}
          onBlur={() => setTimeout(() => setShowFromDropdown(false), 150)}
          placeholder="From contact..."
          className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
        {showFromDropdown && filteredFrom.length > 0 && !fromId && (
          <div className="absolute z-50 mt-1 w-full max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-[#0f1729] shadow-lg">
            {filteredFrom.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onMouseDown={() => {
                  setFromId(c.id);
                  setFromSearch("");
                  setShowFromDropdown(false);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-white/[0.06] transition"
              >
                <span className="text-foreground">{c.name}</span>
                {c.company && (
                  <span className="text-muted-foreground/50 ml-1.5">{c.company}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* To contact */}
      <div className="relative">
        <input
          type="text"
          value={toId ? selectedTo?.name ?? "" : toSearch}
          onChange={(e) => {
            setToSearch(e.target.value);
            setToId("");
            setShowToDropdown(true);
          }}
          onFocus={() => setShowToDropdown(true)}
          onBlur={() => setTimeout(() => setShowToDropdown(false), 150)}
          placeholder="To contact..."
          className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
        {showToDropdown && filteredTo.length > 0 && !toId && (
          <div className="absolute z-50 mt-1 w-full max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-[#0f1729] shadow-lg">
            {filteredTo.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onMouseDown={() => {
                  setToId(c.id);
                  setToSearch("");
                  setShowToDropdown(false);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-white/[0.06] transition"
              >
                <span className="text-foreground">{c.name}</span>
                {c.company && (
                  <span className="text-muted-foreground/50 ml-1.5">{c.company}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={handleFindPath}
          disabled={!fromId || !toId}
          className="flex-1 rounded-lg bg-primary/20 text-primary text-xs font-medium py-1.5 hover:bg-primary/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Find Path
        </button>
        {(fromId || toId || pathResult) && (
          <button
            onClick={handleClear}
            className="rounded-lg border border-white/10 text-muted-foreground text-xs px-2.5 py-1.5 hover:bg-white/[0.03] transition"
          >
            Clear
          </button>
        )}
      </div>

      {pathResult && (
        <p className="text-[10px] text-muted-foreground">
          {pathResult.length > 0
            ? `Path found: ${pathResult.length - 1} hops`
            : "No path found between these contacts"}
        </p>
      )}
    </div>
  );
}
