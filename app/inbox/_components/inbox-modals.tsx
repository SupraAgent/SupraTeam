"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Star, Pin, BellOff, Tag, AlarmClock, StickyNote, Archive, ChevronLeft, ChevronRight, X, Flame, UserX, Keyboard,
} from "lucide-react";
import type { ChatLabel, InboxStatus } from "./inbox-types";
import { COLOR_TAGS } from "./inbox-types";

// ── Context Menu Item ─────────────────────────────────────────

export function CtxItem({ icon, label, active, activeColor, onClick, hasArrow }: {
  icon: React.ReactNode; label: string; active?: boolean; activeColor?: string; onClick: () => void; hasArrow?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
        active ? (activeColor || "text-primary") : "text-foreground"
      }`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {hasArrow && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

// ── Context Menu ─────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  chatId: number;
  groupName: string;
  submenu?: "tag" | "snooze";
}

interface InboxContextMenuProps {
  contextMenu: ContextMenuState;
  getLabel: (chatId: number) => ChatLabel | undefined;
  statuses: Record<number, InboxStatus>;
  toggleLabel: (chatId: number, groupName: string, field: "is_vip" | "is_archived" | "is_pinned" | "is_muted") => void;
  setColorTag: (chatId: number, groupName: string, tag: string | null, color: string | null) => void;
  handleStatusChange: (chatId: number, status: string, snoozedUntil?: string) => void;
  onOpenNote: (chatId: number, groupName: string) => void;
  onNuke: (chatId: number, name: string, type: "messages" | "groups") => void;
  onClose: () => void;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>;
}

export function InboxContextMenu({
  contextMenu, getLabel, statuses, toggleLabel, setColorTag, handleStatusChange,
  onOpenNote, onNuke, onClose, setContextMenu,
}: InboxContextMenuProps) {
  // Close on click outside
  React.useEffect(() => {
    function handleClick() { onClose(); }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-card shadow-xl py-1"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {!contextMenu.submenu && (
        <>
          <CtxItem
            icon={<Star className="h-3.5 w-3.5" />}
            label={getLabel(contextMenu.chatId)?.is_vip ? "Remove VIP" : "Mark as VIP"}
            active={getLabel(contextMenu.chatId)?.is_vip} activeColor="text-amber-400"
            onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_vip"); onClose(); }}
          />
          <CtxItem
            icon={<Pin className="h-3.5 w-3.5" />}
            label={getLabel(contextMenu.chatId)?.is_pinned ? "Unpin" : "Pin to top"}
            active={getLabel(contextMenu.chatId)?.is_pinned}
            onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_pinned"); onClose(); }}
          />
          <CtxItem
            icon={<BellOff className="h-3.5 w-3.5" />}
            label={getLabel(contextMenu.chatId)?.is_muted ? "Unmute" : "Mute"}
            active={getLabel(contextMenu.chatId)?.is_muted}
            onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_muted"); onClose(); }}
          />
          <div className="border-t border-white/10 my-1" />
          <CtxItem
            icon={<Tag className="h-3.5 w-3.5" />} label="Tag as..."
            onClick={() => setContextMenu({ ...contextMenu, submenu: "tag" })} hasArrow
          />
          <CtxItem
            icon={<AlarmClock className="h-3.5 w-3.5" />}
            label={statuses[contextMenu.chatId]?.status === "snoozed" ? "Snoozed — unsnooze" : "Snooze..."}
            active={statuses[contextMenu.chatId]?.status === "snoozed"} activeColor="text-cyan-400"
            onClick={() => {
              if (statuses[contextMenu.chatId]?.status === "snoozed") {
                handleStatusChange(contextMenu.chatId, "open");
                onClose();
              } else {
                setContextMenu({ ...contextMenu, submenu: "snooze" });
              }
            }}
            hasArrow={statuses[contextMenu.chatId]?.status !== "snoozed"}
          />
          <CtxItem
            icon={<StickyNote className="h-3.5 w-3.5" />}
            label={getLabel(contextMenu.chatId)?.note ? "Edit note" : "Add note"}
            active={!!getLabel(contextMenu.chatId)?.note} activeColor="text-yellow-400"
            onClick={() => { onOpenNote(contextMenu.chatId, contextMenu.groupName); onClose(); }}
          />
          <div className="border-t border-white/10 my-1" />
          <CtxItem
            icon={<Archive className="h-3.5 w-3.5" />}
            label={getLabel(contextMenu.chatId)?.is_archived ? "Unarchive" : "Archive"}
            active={getLabel(contextMenu.chatId)?.is_archived}
            onClick={() => { toggleLabel(contextMenu.chatId, contextMenu.groupName, "is_archived"); onClose(); }}
          />
          {contextMenu.chatId > 0 && (
            <>
              <div className="border-t border-white/10 my-1" />
              <CtxItem
                icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
                label="Delete My Messages"
                onClick={() => { onNuke(contextMenu.chatId, contextMenu.groupName, "messages"); onClose(); }}
              />
              <CtxItem
                icon={<UserX className="h-3.5 w-3.5 text-red-400" />}
                label="Kick from My Groups"
                onClick={() => { onNuke(contextMenu.chatId, contextMenu.groupName, "groups"); onClose(); }}
              />
            </>
          )}
        </>
      )}

      {/* Tag submenu */}
      {contextMenu.submenu === "tag" && (
        <>
          <CtxItem
            icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Back"
            onClick={() => setContextMenu({ ...contextMenu, submenu: undefined })}
          />
          <div className="border-t border-white/10 my-1" />
          {COLOR_TAGS.map((t) => (
            <CtxItem
              key={t.key}
              icon={<div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />}
              label={t.label}
              active={getLabel(contextMenu.chatId)?.color_tag === t.key}
              onClick={() => {
                const current = getLabel(contextMenu.chatId)?.color_tag;
                setColorTag(contextMenu.chatId, contextMenu.groupName, current === t.key ? null : t.key, current === t.key ? null : t.color);
                onClose();
              }}
            />
          ))}
          {getLabel(contextMenu.chatId)?.color_tag && (
            <>
              <div className="border-t border-white/10 my-1" />
              <CtxItem
                icon={<X className="h-3.5 w-3.5" />} label="Remove tag"
                onClick={() => { setColorTag(contextMenu.chatId, contextMenu.groupName, null, null); onClose(); }}
              />
            </>
          )}
        </>
      )}

      {/* Snooze submenu */}
      {contextMenu.submenu === "snooze" && (
        <>
          <CtxItem
            icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Back"
            onClick={() => setContextMenu({ ...contextMenu, submenu: undefined })}
          />
          <div className="border-t border-white/10 my-1" />
          {[
            { label: "1 hour", hours: 1 },
            { label: "4 hours", hours: 4 },
            { label: "Tomorrow 9am", hours: -1 },
            { label: "1 day", hours: 24 },
            { label: "3 days", hours: 72 },
            { label: "1 week", hours: 168 },
          ].map((opt) => {
            const until = opt.hours === -1
              ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); })()
              : new Date(Date.now() + opt.hours * 3600000).toISOString();
            return (
              <CtxItem
                key={opt.label}
                icon={<AlarmClock className="h-3.5 w-3.5" />}
                label={opt.label}
                onClick={() => { handleStatusChange(contextMenu.chatId, "snoozed", until); onClose(); }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Note Modal ─────────────────────────────────────────────────

interface NoteModalProps {
  chatId: number;
  groupName: string;
  noteText: string;
  setNoteText: (text: string) => void;
  hasExistingNote: boolean;
  onSave: (chatId: number, groupName: string, text: string) => void;
  onClose: () => void;
}

export function NoteModal({ chatId, groupName, noteText, setNoteText, hasExistingNote, onSave, onClose }: NoteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Note — {groupName}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          rows={4}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a quick note about this conversation..."
          autoFocus
        />
        <div className="flex items-center justify-end gap-2">
          {hasExistingNote && (
            <Button size="sm" variant="ghost" onClick={() => { onSave(chatId, groupName, ""); onClose(); }}>
              Delete note
            </Button>
          )}
          <Button size="sm" onClick={() => { onSave(chatId, groupName, noteText); onClose(); }}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Keyboard Shortcut Help Modal ──────────────────────────────

interface ShortcutHelpModalProps {
  onClose: () => void;
}

export function ShortcutHelpModal({ onClose }: ShortcutHelpModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            Keyboard Shortcuts
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {([
            ["j / k", "Next / previous conversation"],
            ["Enter", "Open selected conversation"],
            ["Escape", "Close / deselect"],
            ["r", "Focus reply"],
            ["e", "Archive conversation"],
            ["s", "Toggle VIP / star"],
            ["p", "Toggle pin"],
            ["m", "Toggle mute"],
            ["n", "Snooze (1 hour)"],
            ["/", "Focus search"],
            ["Shift+A", "Assign to me"],
            ["?", "Toggle this help"],
          ] as const).map(([key, desc]) => (
            <div key={key} className="flex items-center gap-2 py-1">
              <kbd className="inline-flex items-center justify-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground min-w-[28px]">
                {key}
              </kbd>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
