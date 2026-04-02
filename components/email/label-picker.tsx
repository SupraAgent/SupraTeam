"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Label } from "@/lib/email/types";
import { Check, X } from "lucide-react";

interface LabelPickerProps {
  open: boolean;
  onClose: () => void;
  labels: Label[];
  onApply: (labelId: string) => void;
}

/** Quick label picker overlay — press L to open, pick a label to apply to selected thread(s) */
export function LabelPicker({ open, onClose, labels, onApply }: LabelPickerProps) {
  const [filter, setFilter] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setFilter("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const userLabels = labels.filter((l) => l.type === "user");
  const filtered = filter
    ? userLabels.filter((l) => l.name.toLowerCase().includes(filter.toLowerCase()))
    : userLabels;

  function displayName(name: string) {
    return name.includes("/") ? name.split("/").pop()! : name;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[200]" onClick={onClose} />
      {/* Picker */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-64 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "hsl(var(--surface-3))" }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length > 0) {
                onApply(filtered[0].id);
                onClose();
              }
            }}
            placeholder="Apply label..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition p-0.5">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-56 overflow-y-auto thin-scroll py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
              No matching labels
            </div>
          ) : (
            filtered.map((label) => (
              <button
                key={label.id}
                onClick={() => { onApply(label.id); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/5 transition"
              >
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: label.color ?? "hsl(var(--primary))" }}
                />
                <span className="flex-1 text-left truncate text-foreground/90">
                  {displayName(label.name)}
                </span>
                <Check className="h-3 w-3 text-muted-foreground/0" />
              </button>
            ))
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-muted-foreground/50">
          Press Enter to apply first match &middot; Esc to close
        </div>
      </div>
    </>
  );
}
