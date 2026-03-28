"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
};

type ComboboxProps = {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** When true, allows typing a custom value not in the options list. */
  allowCustom?: boolean;
};

/** Duration (ms) for open/close animation. */
const ANIM_MS = 100;

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  className,
  disabled = false,
  allowCustom = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  // Keeps the dropdown mounted during exit animation
  const [mounted, setMounted] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [hasTyped, setHasTyped] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const [highlightIndex, setHighlightIndex] = React.useState(-1);
  const [dropdownPos, setDropdownPos] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Track whether focus came from mouse click vs keyboard
  const openedByMouseRef = React.useRef(false);

  // Stable IDs for ARIA
  const baseId = React.useId();
  const listboxId = `${baseId}-listbox`;
  const getOptionId = (index: number) => `${baseId}-opt-${index}`;

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? (allowCustom ? value : "");

  const filtered = React.useMemo(
    () =>
      query && query !== selectedLabel
        ? options.filter((o) =>
            o.label.toLowerCase().includes(query.toLowerCase())
          )
        : options,
    [options, query, selectedLabel]
  );

  // ── Open / close helpers ────────────────────────────────────

  function openDropdown() {
    if (disabled || open) return;
    setQuery(selectedLabel);
    setHasTyped(false);
    setOpen(true);
    setMounted(true);
    setClosing(false);
    const idx = options.findIndex((o) => o.value === value);
    setHighlightIndex(idx >= 0 ? idx : -1);
  }

  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for values read by closeDropdown so outside-click never gets stale data
  const queryRef = React.useRef(query);
  queryRef.current = query;
  const hasTypedRef = React.useRef(hasTyped);
  hasTypedRef.current = hasTyped;
  const valueRef = React.useRef(value);
  valueRef.current = value;

  function closeDropdown(skipCustomCommit = false) {
    if (!open) return;
    // In allowCustom mode, commit whatever the user typed as the value
    if (!skipCustomCommit && allowCustom && hasTypedRef.current) {
      const trimmed = queryRef.current.trim();
      if (trimmed && trimmed !== valueRef.current) {
        onChange(trimmed);
      }
    }
    setClosing(true);
    setOpen(false);
    setQuery("");
    setHasTyped(false);
    // Keep mounted for exit animation, then unmount
    closeTimerRef.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, ANIM_MS);
  }

  // Cleanup close timer on unmount
  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // ── Position: compute on open + track scroll/resize ─────────

  const updatePosition = React.useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  React.useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;

    // Find the nearest scrollable ancestor to listen on
    function getScrollParent(el: HTMLElement | null): HTMLElement | Window {
      if (!el) return window;
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflow + style.overflowY)) return el;
      return getScrollParent(el.parentElement);
    }

    const scrollTarget = getScrollParent(containerRef.current);
    scrollTarget.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });
    return () => {
      scrollTarget.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  // ── Outside click ───────────────────────────────────────────

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Highlight management ────────────────────────────────────

  // When the filtered list changes due to typing, try to keep the
  // highlighted item stable; fall back to selected or first item
  const prevHighlightValueRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    // Try to find the previously highlighted item in the new filtered list
    const prevValue = prevHighlightValueRef.current;
    if (prevValue) {
      const idx = filtered.findIndex((o) => o.value === prevValue);
      if (idx >= 0) {
        setHighlightIndex(idx);
        return;
      }
    }
    // Fall back to selected item, then first item
    const selectedIdx = filtered.findIndex((o) => o.value === value);
    setHighlightIndex(selectedIdx >= 0 ? selectedIdx : (filtered.length > 0 ? 0 : -1));
  }, [filtered, open, value]);

  // Track which value is highlighted so we can preserve it across filter changes
  React.useEffect(() => {
    prevHighlightValueRef.current =
      highlightIndex >= 0 && filtered[highlightIndex]
        ? filtered[highlightIndex].value
        : null;
  }, [highlightIndex, filtered]);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  // ── Selection ───────────────────────────────────────────────

  function select(opt: ComboboxOption) {
    onChange(opt.value);
    closeDropdown(true); // skip custom commit — we already set the value
  }

  // ── Keyboard ────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((i) =>
          i < filtered.length - 1 ? i + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((i) =>
          i > 0 ? i - 1 : filtered.length - 1
        );
        break;
      case "Home":
        e.preventDefault();
        setHighlightIndex(0);
        break;
      case "End":
        e.preventDefault();
        setHighlightIndex(filtered.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          select(filtered[highlightIndex]);
        } else if (allowCustom && query.trim()) {
          onChange(query.trim());
          closeDropdown(true);
        }
        break;
      case "Escape":
        e.preventDefault();
        closeDropdown();
        break;
      case "Tab":
        closeDropdown();
        break; // let default tab proceed
    }
  }

  // ── Render ──────────────────────────────────────────────────

  const dropdown = mounted && dropdownPos
    ? createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className={cn(
            "fixed z-[9999] max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-background py-1 shadow-xl",
          )}
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            animation: `${closing ? "combobox-out" : "combobox-in"} ${ANIM_MS}ms ease-out`,
            ...(closing ? { opacity: 0, pointerEvents: "none" as const } : {}),
          }}
        >
          {filtered.length === 0 ? (
            <li
              className="px-3 py-2.5 text-xs text-muted-foreground"
              role="presentation"
            >
              No matches
            </li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.value}
                id={getOptionId(i)}
                role="option"
                aria-selected={opt.value === value}
                className={cn(
                  "cursor-pointer px-3 py-2.5 text-sm transition-colors min-h-[44px] flex items-center",
                  opt.value === value
                    ? "text-primary"
                    : "text-foreground",
                  i === highlightIndex
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(opt);
                }}
              >
                <span className="flex items-center gap-2">
                  {opt.value === value && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className="shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 6L5 8.5L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {opt.label}
                </span>
              </li>
            ))
          )}
        </ul>,
        document.body
      )
    : null;

  return (
    <div ref={containerRef} className={className}>
      {/* Trigger / Search input */}
      <div
        className={cn(
          "flex items-center w-full rounded-lg border bg-white/5 px-3 py-1.5 text-sm text-foreground transition",
          open
            ? "border-primary/50 ring-1 ring-primary/30"
            : "border-white/10 hover:border-white/20",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onMouseDown={() => {
          openedByMouseRef.current = true;
        }}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0 disabled:cursor-not-allowed"
          placeholder={open ? "Type to filter…" : placeholder}
          value={open ? query : selectedLabel}
          onFocus={() => {
            // Only open on mouse-click focus, not keyboard tab-through
            if (disabled) return;
            if (openedByMouseRef.current) {
              openDropdown();
            }
            openedByMouseRef.current = false;
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setHasTyped(true);
            if (!open) openDropdown();
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            open && highlightIndex >= 0
              ? getOptionId(highlightIndex)
              : undefined
          }
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          className="ml-1 shrink-0 text-muted-foreground disabled:cursor-not-allowed"
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            if (open) {
              closeDropdown();
            } else {
              openDropdown();
              inputRef.current?.focus();
            }
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={cn(
              "transition-transform",
              open && "rotate-180"
            )}
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Live region — only announces after user has typed a filter */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {open && hasTyped
          ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} available`
          : ""}
      </div>

      {/* Portaled dropdown */}
      {dropdown}
    </div>
  );
}
