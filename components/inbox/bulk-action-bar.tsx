"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tag, Pin, Clock, Archive, X, CheckSquare, ChevronDown } from "lucide-react";

const COLOR_TAGS = [
  { key: "hot_lead", label: "Hot Lead", color: "#ef4444" },
  { key: "partner", label: "Partner", color: "#3b82f6" },
  { key: "investor", label: "Investor", color: "#8b5cf6" },
  { key: "vip_client", label: "VIP Client", color: "#f59e0b" },
  { key: "urgent", label: "Urgent", color: "#f97316" },
  { key: "follow_up", label: "Follow Up", color: "#06b6d4" },
] as const;

const SNOOZE_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "Tomorrow 9am", hours: -1 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
] as const;

function computeSnoozeUntil(hours: number): string {
  if (hours === -1) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(Date.now() + hours * 3600000).toISOString();
}

type BulkActionBarProps = {
  count: number;
  totalCount: number;
  onTag: (tag: string | null, color: string | null) => void;
  onPin: () => void;
  onSnooze: (until: string) => void;
  onArchive: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClear: () => void;
};

export function BulkActionBar({
  count,
  totalCount,
  onTag,
  onPin,
  onSnooze,
  onArchive,
  onSelectAll,
  onDeselectAll,
  onClear,
}: BulkActionBarProps) {
  const [showTagMenu, setShowTagMenu] = React.useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = React.useState(false);
  const tagRef = React.useRef<HTMLDivElement>(null);
  const snoozeRef = React.useRef<HTMLDivElement>(null);

  // Close menus on outside click
  React.useEffect(() => {
    if (!showTagMenu && !showSnoozeMenu) return;
    function handleClick(e: MouseEvent) {
      if (showTagMenu && tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setShowTagMenu(false);
      }
      if (showSnoozeMenu && snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setShowSnoozeMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTagMenu, showSnoozeMenu]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-primary/30 bg-[hsl(225,35%,10%)] px-4 py-2.5 flex items-center gap-3 flex-wrap shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckSquare className="h-4 w-4 text-primary" />
        {count} conversation{count !== 1 ? "s" : ""} selected
      </div>

      <div className="flex items-center gap-1.5 ml-auto flex-wrap">
        {count < totalCount ? (
          <Button variant="ghost" size="sm" onClick={onSelectAll} className="h-7 text-xs">
            Select all
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDeselectAll} className="h-7 text-xs">
            Deselect all
          </Button>
        )}

        {/* Tag */}
        <div className="relative" ref={tagRef}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowTagMenu(!showTagMenu); setShowSnoozeMenu(false); }}
            className="h-7 text-xs"
          >
            <Tag className="h-3 w-3 mr-1" /> Tag
            <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
          </Button>
          {showTagMenu && (
            <div className="absolute bottom-full left-0 mb-1 z-50 rounded-lg border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl py-1 min-w-[160px]">
              {COLOR_TAGS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { onTag(t.key, t.color); setShowTagMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-white/10 flex items-center gap-2"
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  {t.label}
                </button>
              ))}
              <div className="border-t border-white/10 my-1" />
              <button
                onClick={() => { onTag(null, null); setShowTagMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/10"
              >
                Clear tag
              </button>
            </div>
          )}
        </div>

        {/* Pin */}
        <Button variant="ghost" size="sm" onClick={onPin} className="h-7 text-xs">
          <Pin className="h-3 w-3 mr-1" /> Pin
        </Button>

        {/* Snooze */}
        <div className="relative" ref={snoozeRef}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowSnoozeMenu(!showSnoozeMenu); setShowTagMenu(false); }}
            className="h-7 text-xs"
          >
            <Clock className="h-3 w-3 mr-1" /> Snooze
            <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
          </Button>
          {showSnoozeMenu && (
            <div className="absolute bottom-full left-0 mb-1 z-50 rounded-lg border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl py-1 min-w-[150px]">
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => { onSnooze(computeSnoozeUntil(opt.hours)); setShowSnoozeMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-white/10"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Archive */}
        <Button variant="ghost" size="sm" onClick={onArchive} className="h-7 text-xs text-orange-400 hover:text-orange-300">
          <Archive className="h-3 w-3 mr-1" /> Archive
        </Button>

        {/* Clear selection */}
        <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs text-muted-foreground">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
