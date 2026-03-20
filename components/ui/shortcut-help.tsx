"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "H"], label: "Go to Home" },
      { keys: ["G", "P"], label: "Go to Pipeline" },
      { keys: ["G", "C"], label: "Go to Contacts" },
      { keys: ["G", "G"], label: "Go to Groups" },
      { keys: ["G", "B"], label: "Go to Broadcasts" },
      { keys: ["G", "E"], label: "Go to Email" },
      { keys: ["G", "S"], label: "Go to Settings" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["\u2318", "K"], label: "Command palette" },
      { keys: ["/"], label: "Quick search" },
      { keys: ["?"], label: "This help" },
    ],
  },
  {
    title: "Pipeline",
    shortcuts: [
      { keys: ["N"], label: "New deal" },
      { keys: ["Esc"], label: "Close panel / clear filters" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-white/15 bg-white/[0.06] px-1.5 font-mono text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed left-1/2 top-[15%] z-50 w-full max-w-lg -translate-x-1/2">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--background))] shadow-xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label="Close"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-5">
            <div className="grid gap-6">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </div>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((s) => (
                      <div
                        key={s.label}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5"
                      >
                        <span className="text-sm text-muted-foreground">{s.label}</span>
                        <div className="flex items-center gap-1">
                          {s.keys.map((k, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && (
                                <span className="text-[10px] text-muted-foreground/50">then</span>
                              )}
                              <Kbd>{k}</Kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 px-5 py-2.5 text-center text-xs text-muted-foreground">
            Press <Kbd>?</Kbd> or <Kbd>Esc</Kbd> to close
          </div>
        </div>
      </div>
    </>
  );
}
