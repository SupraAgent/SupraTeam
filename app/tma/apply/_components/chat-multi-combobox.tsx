"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, X, Search } from "lucide-react";

type Option = { value: string; label: string };

type ChatMultiComboboxProps = {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
};

export function ChatMultiCombobox({ options, value, onChange, placeholder = "Select..." }: ChatMultiComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean) as string[];

  const toggle = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  const remove = (optValue: string) => {
    onChange(value.filter((v) => v !== optValue));
  };

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
          "bg-white/5 px-4 py-3 text-sm text-left transition-colors min-h-[48px]",
          "hover:border-white/20 focus:outline-none focus:border-[hsl(var(--primary))]/50",
          open && "border-[hsl(var(--primary))]/50"
        )}
      >
        <div className="flex-1 flex flex-wrap gap-1.5">
          {selectedLabels.length === 0 ? (
            <span className="text-white/40">{placeholder}</span>
          ) : (
            selectedLabels.map((label, i) => (
              <span
                key={value[i]}
                className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] px-2 py-0.5 text-xs font-medium"
              >
                {label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(value[i]);
                  }}
                  className="hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
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
              filtered.map((opt) => {
                const selected = value.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors",
                      "hover:bg-white/5",
                      selected && "text-[hsl(var(--primary))]"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        selected
                          ? "bg-[hsl(var(--primary))] border-[hsl(var(--primary))]"
                          : "border-white/20"
                      )}
                    >
                      {selected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="flex-1">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
