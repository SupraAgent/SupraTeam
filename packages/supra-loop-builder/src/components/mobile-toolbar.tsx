"use client";

import * as React from "react";
import { cn } from "../lib/utils";

type MobileToolbarProps = {
  onOpenPalette: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
};

export function MobileToolbar({
  onOpenPalette,
  onUndo,
  onRedo,
  onDelete,
  canUndo,
  canRedo,
  hasSelection,
}: MobileToolbarProps) {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-20 flex items-center justify-around border-t border-white/10 bg-background/95 backdrop-blur-sm px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <ToolbarButton onClick={onOpenPalette} label="Add">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={onUndo} label="Undo" disabled={!canUndo}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={onRedo} label="Redo" disabled={!canRedo}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.69 3L21 13" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={onDelete} label="Delete" disabled={!hasSelection} danger>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex flex-col items-center gap-0.5 min-h-[44px] min-w-[44px] justify-center rounded-lg p-1.5 transition",
        disabled && "opacity-30 cursor-not-allowed",
        !disabled && !danger && "text-muted-foreground hover:text-foreground active:bg-white/10",
        !disabled && danger && "text-red-400 hover:text-red-300 active:bg-red-500/10",
      )}
    >
      <span aria-hidden="true">{children}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
