"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Label } from "@/lib/email/types";

// System labels we care about, in order
const SYSTEM_LABELS = [
  { id: "INBOX", name: "Inbox", icon: InboxIcon },
  { id: "STARRED", name: "Starred", icon: StarIcon },
  { id: "SENT", name: "Sent", icon: SendIcon },
  { id: "DRAFT", name: "Drafts", icon: DraftIcon },
  { id: "SPAM", name: "Spam", icon: SpamIcon },
  { id: "TRASH", name: "Trash", icon: TrashIcon },
] as const;

type LabelSidebarProps = {
  labels: Label[];
  activeLabel: string;
  onSelectLabel: (labelId: string) => void;
  unreadCounts: Record<string, number>;
};

export function LabelSidebar({ labels, activeLabel, onSelectLabel, unreadCounts }: LabelSidebarProps) {
  const userLabels = labels.filter((l) => l.type === "user");

  return (
    <div className="w-full space-y-1">
      {/* System labels */}
      {SYSTEM_LABELS.map((sl) => (
        <button
          key={sl.id}
          onClick={() => onSelectLabel(sl.id)}
          className={cn(
            "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
            activeLabel === sl.id
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          <sl.icon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{sl.name}</span>
          {(unreadCounts[sl.id] ?? 0) > 0 && (
            <span className="text-[10px] text-primary font-semibold">
              {unreadCounts[sl.id]}
            </span>
          )}
        </button>
      ))}

      {/* User labels */}
      {userLabels.length > 0 && (
        <>
          <div className="pt-2 pb-1 px-2.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Groups
            </span>
          </div>
          {userLabels.map((label) => (
            <button
              key={label.id}
              onClick={() => onSelectLabel(label.id)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeLabel === label.id
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: label.color ?? "hsl(var(--primary))" }}
              />
              <span className="flex-1 text-left truncate">{label.name}</span>
              {(label.unreadCount ?? 0) > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {label.unreadCount}
                </span>
              )}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ── Inline SVGs ─────────────────────────────────────────────

function InboxIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg>;
}

function StarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

function SendIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
}

function DraftIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}

function SpamIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
}

function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
}
