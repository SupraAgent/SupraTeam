"use client";

import * as React from "react";

interface DealSelectorProps {
  deals: { id: string; name: string; board_type: string; stage?: string }[];
  selectedDealId: string | null;
  onSelect: (dealId: string) => void;
  className?: string;
}

export function DealSelector({ deals, selectedDealId, onSelect, className }: DealSelectorProps) {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filtered = deals.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.board_type.toLowerCase().includes(search.toLowerCase())
  );

  const selected = deals.find((d) => d.id === selectedDealId);

  return (
    <div className={className}>
      <div className="relative">
        <input
          type="text"
          value={selectedDealId ? selected?.name ?? "" : search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!selectedDealId) setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onClick={() => {
            if (selectedDealId) {
              setSearch("");
              setOpen(true);
            }
          }}
          placeholder="Select a deal..."
          className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-[#0f1729] shadow-lg">
            {filtered.slice(0, 15).map((d) => (
              <button
                key={d.id}
                onMouseDown={() => {
                  onSelect(d.id);
                  setSearch("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.06] transition flex items-center justify-between"
              >
                <span className="text-foreground truncate">{d.name}</span>
                <span className="text-[10px] text-muted-foreground/50 ml-2 shrink-0">
                  {d.board_type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
