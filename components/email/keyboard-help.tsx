"use client";

import * as React from "react";

type KeyboardHelpProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUT_GROUPS = [
  {
    label: "Navigation",
    shortcuts: [
      ["j / k", "Next / previous thread"],
      ["Enter", "Open thread"],
      ["Escape", "Back to list"],
      ["g i", "Go to Inbox"],
      ["g s", "Go to Starred"],
      ["g t", "Go to Sent"],
      ["g d", "Go to Drafts"],
      ["g a", "Go to All Mail"],
    ],
  },
  {
    label: "Actions",
    shortcuts: [
      ["e", "Archive"],
      ["d / #", "Delete"],
      ["s", "Star / unstar"],
      ["u", "Mark unread"],
      ["h", "Snooze"],
      ["[ / ]", "Archive & navigate"],
    ],
  },
  {
    label: "Compose",
    shortcuts: [
      ["c", "Compose new"],
      ["r", "Reply"],
      ["a", "Reply all"],
      ["f", "Forward"],
      ["\u2318+Enter", "Send"],
      ["\u2318+;", "Insert template"],
    ],
  },
  {
    label: "Search",
    shortcuts: [
      ["/ or \u2318+K", "Open search"],
      ["from:", "Filter by sender"],
      ["to:", "Filter by recipient"],
      ["subject:", "Filter by subject"],
      ["has:attachment", "Has attachment"],
      ["is:unread", "Unread only"],
      ["newer_than:7d", "Last 7 days"],
    ],
  },
];

export function KeyboardHelp({ open, onClose }: KeyboardHelpProps) {
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-fade-in"
        style={{ backgroundColor: "hsl(var(--surface-4))" }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-5 max-h-[70vh] overflow-y-auto thin-scroll">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <kbd className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                      {key}
                    </kbd>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-2 border-t border-white/10 text-[10px] text-muted-foreground/40 text-center">
          Press <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">?</kbd> to toggle this help
        </div>
      </div>
    </div>
  );
}
