"use client";

import * as React from "react";
import { StickyNote, Trophy, XCircle } from "lucide-react";
import { hapticImpact } from "./haptic";

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  variant?: "danger";
}

interface QuickActionMenuProps {
  dealId: string;
  dealName: string;
  position: { top: number; left: number };
  onClose: () => void;
  onAddNote: (dealId: string) => void;
  onMarkWon: (dealId: string) => void;
  onMarkLost: (dealId: string) => void;
}

export function QuickActionMenu({
  dealId,
  dealName,
  position,
  onClose,
  onAddNote,
  onMarkWon,
  onMarkLost,
}: QuickActionMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: TouchEvent | MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const actions: QuickAction[] = [
    {
      label: "Add Note",
      icon: <StickyNote className="h-4 w-4" />,
      action: () => { onAddNote(dealId); onClose(); },
    },
    {
      label: "Mark Won",
      icon: <Trophy className="h-4 w-4" />,
      action: () => { hapticImpact("medium"); onMarkWon(dealId); onClose(); },
    },
    {
      label: "Mark Lost",
      icon: <XCircle className="h-4 w-4" />,
      action: () => { hapticImpact("medium"); onMarkLost(dealId); onClose(); },
      variant: "danger",
    },
  ];

  // Position the menu above or below the card, centered horizontally
  const menuTop = position.top > window.innerHeight / 2
    ? position.top - 160
    : position.top + 10;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50">
      <div
        ref={menuRef}
        className="absolute w-48 rounded-xl border border-white/10 bg-[hsl(225,30%,10%)] shadow-xl overflow-hidden"
        style={{ top: menuTop, left: Math.max(8, Math.min(position.left - 96, window.innerWidth - 200)) }}
      >
        <div className="px-3 py-2 border-b border-white/10">
          <p className="text-xs font-medium text-foreground truncate">{dealName}</p>
        </div>
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.action}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition active:bg-white/[0.06] ${
              action.variant === "danger" ? "text-red-400" : "text-foreground"
            }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
