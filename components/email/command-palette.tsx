"use client";

import * as React from "react";
import { Command } from "cmdk";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
};

const COMMAND_GROUPS = [
  {
    heading: "Actions",
    items: [
      { label: "Archive", shortcut: "e", action: "archive" },
      { label: "Trash", shortcut: "#", action: "trash" },
      { label: "Star / Unstar", shortcut: "s", action: "star" },
      { label: "Mark unread", shortcut: "u", action: "unread" },
      { label: "Snooze", shortcut: "h", action: "snooze" },
      { label: "Reply", shortcut: "r", action: "reply" },
      { label: "Reply All", shortcut: "a", action: "replyAll" },
      { label: "Forward", shortcut: "f", action: "forward" },
    ],
  },
  {
    heading: "Compose",
    items: [
      { label: "New email", shortcut: "c", action: "compose" },
    ],
  },
  {
    heading: "Navigate",
    items: [
      { label: "Go to Inbox", shortcut: "gi", action: "goInbox" },
      { label: "Go to Starred", shortcut: "gs", action: "goStarred" },
      { label: "Go to Sent", shortcut: "gt", action: "goSent" },
      { label: "Go to Drafts", shortcut: "gd", action: "goDrafts" },
      { label: "Search", shortcut: "/", action: "search" },
    ],
  },
  {
    heading: "View",
    items: [
      { label: "Show keyboard shortcuts", shortcut: "?", action: "help" },
      { label: "Refresh inbox", shortcut: "", action: "refresh" },
    ],
  },
];

export function CommandPalette({ open, onClose, onAction }: CommandPaletteProps) {
  const select = React.useCallback(
    (action: string) => {
      onAction(action);
      onClose();
    },
    [onAction, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <Command
        className="relative w-full max-w-[500px] max-h-[400px] rounded-xl border border-white/10 bg-[hsl(var(--surface-3))] shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
        loop
      >
        {/* Input */}
        <div className="flex items-center px-4 border-b border-white/10">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-muted-foreground mr-3"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Command.Input
            placeholder="Type a command…"
            className="flex-1 h-12 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none"
            autoFocus
          />
        </div>

        {/* List */}
        <Command.List className="flex-1 overflow-y-auto py-2 thin-scroll">
          <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {COMMAND_GROUPS.map((group) => (
            <Command.Group
              key={group.heading}
              heading={group.heading}
              className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              {group.items.map((item) => (
                <Command.Item
                  key={item.action}
                  value={`${item.label} ${item.action}`}
                  onSelect={() => select(item.action)}
                  className="flex items-center justify-between mx-2 px-3 py-2 rounded-lg text-sm text-foreground cursor-pointer select-none data-[selected=true]:bg-white/[0.08] transition-colors"
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <kbd className="ml-auto shrink-0 rounded bg-white/[0.06] border border-white/10 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
