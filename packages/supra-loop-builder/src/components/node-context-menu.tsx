"use client";

import * as React from "react";
import { useTouchDevice } from "../hooks/use-touch-device";

type ContextMenuProps = {
  x: number;
  y: number;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  onClose: () => void;
  onLockGroup?: () => void;
  onUnlockGroup?: () => void;
  isLocked?: boolean;
  selectionCount?: number;
};

export function NodeContextMenu({
  x,
  y,
  onEdit,
  onDuplicate,
  onDelete,
  onClose,
  onLockGroup,
  onUnlockGroup,
  isLocked,
  selectionCount,
}: ContextMenuProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { isMobile } = useTouchDevice();

  React.useEffect(() => {
    function handleClick(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const isMulti = (selectionCount ?? 1) > 1;

  const items: {
    label: string;
    icon: string;
    action: () => void;
    danger?: boolean;
  }[] = [];

  // Single-node items
  if (!isMulti && onEdit) {
    items.push({ label: "Edit", icon: "\u270F\uFE0F", action: onEdit });
  }
  if (!isMulti && onDuplicate) {
    items.push({ label: "Duplicate", icon: "\uD83D\uDCCB", action: onDuplicate });
  }

  // Multi-select grouping items
  if (isMulti || isLocked) {
    if (isLocked && onUnlockGroup) {
      items.push({ label: "Unlock Group", icon: "\uD83D\uDD13", action: onUnlockGroup });
    } else if (!isLocked && onLockGroup && isMulti) {
      items.push({ label: "Lock Group", icon: "\uD83D\uDD12", action: onLockGroup });
    }
  }

  // Always show delete
  items.push({
    label: isMulti ? `Delete ${selectionCount} nodes` : "Delete",
    icon: "\uD83D\uDDD1",
    action: onDelete,
    danger: true,
  });

  // Mobile: centered action sheet
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
        <div
          ref={ref}
          role="menu"
          aria-label="Node actions"
          className="fixed left-4 right-4 bottom-4 z-50 rounded-2xl border border-white/10 bg-neutral-900/95 py-2 shadow-xl backdrop-blur-sm"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                item.action();
                onClose();
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition active:bg-white/10 ${
                item.danger
                  ? "text-red-400"
                  : "text-foreground"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div className="border-t border-white/10 mt-1 pt-1">
            <button
              onClick={onClose}
              className="flex w-full items-center justify-center py-3 text-sm font-medium text-muted-foreground active:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  }

  // Desktop: positioned dropdown
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Node actions"
      className="fixed z-50 min-w-[140px] rounded-xl border border-white/10 bg-neutral-900/95 py-1 shadow-xl backdrop-blur-sm"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            item.action();
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-white/10 ${
            item.danger
              ? "text-red-400 hover:text-red-300"
              : "text-foreground"
          }`}
        >
          <span className="text-xs">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
