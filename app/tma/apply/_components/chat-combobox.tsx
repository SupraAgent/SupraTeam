"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check, Search } from "lucide-react";

type Option = { value: string; label: string };

type ChatComboboxProps = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function ChatCombobox({ options, value, onChange, placeholder = "Select..." }: ChatComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find((o) => o.value === value)?.label;

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-xl border border-white/10",
          "bg-white/5 px-4 py-3 text-sm text-left transition-colors",
          "hover:border-white/20 focus:outline-none focus:border-[hsl(var(--primary))]/50",
          open && "border-[hsl(var(--primary))]/50",
          !value && "text-white/40"
        )}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronDown className={cn("w-4 h-4 text-white/40 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 bottom-full mb-1.5 w-full rounded-xl border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl overflow-hidden animate-dropdown-in">
          {options.length > 5 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
              <Search className="w-3.5 h-3.5 text-white/30" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/30 outline-none"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-white/30">No results</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors",
                    "hover:bg-white/5",
                    opt.value === value && "text-[hsl(var(--primary))]"
                  )}
                >
                  <span className="flex-1">{opt.label}</span>
                  {opt.value === value && <Check className="w-3.5 h-3.5" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
