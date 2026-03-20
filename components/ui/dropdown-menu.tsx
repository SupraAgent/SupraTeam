"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type DropdownMenuProps = {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
};

type DropdownItemProps = {
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function DropdownMenu({ trigger, children, align = "right", className }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = menuRef.current?.offsetHeight ?? 180;
    let left = align === "right" ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight + 8 ? rect.top - menuHeight - 4 : rect.bottom + 4;
    setPos({ top, left });
  }, [align]);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Tab") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function handleScroll() { setOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(updatePosition);
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open || !menuRef.current) return;
    const items = menuRef.current.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])");
    if (items.length > 0) items[0].focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (!menuRef.current) return;
      const focused = document.activeElement as HTMLElement;
      const list = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])"));
      const idx = list.indexOf(focused as HTMLButtonElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        list[(idx + 1) % list.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        list[(idx - 1 + list.length) % list.length]?.focus();
      }
    }
    menuRef.current.addEventListener("keydown", handleKeyDown);
    const el = menuRef.current;
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn("rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60", className)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
      >
        {trigger}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 w-48 rounded-lg border border-white/10 bg-background p-1 shadow-lg animate-dropdown-in"
          style={{ top: pos.top, left: pos.left }}
        >
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child) && child.type === DropdownItem) {
              return React.cloneElement(child as React.ReactElement<DropdownItemProps & { onClose?: () => void }>, {
                onClose: () => {
                  setOpen(false);
                  triggerRef.current?.focus();
                },
              });
            }
            return child;
          })}
        </div>,
        document.body
      )}
    </>
  );
}

export function DropdownItem({
  onClick,
  disabled,
  destructive,
  children,
  className,
  onClose,
}: DropdownItemProps & { onClose?: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClick?.();
        onClose?.();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : destructive
            ? "text-red-400 hover:bg-red-500/10"
            : "text-foreground hover:bg-white/[0.06]",
        className
      )}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-white/10" />;
}
