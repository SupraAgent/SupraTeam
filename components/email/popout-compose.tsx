"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ComposeForm } from "./compose-form";

type PopoutComposeProps = {
  mode: "compose" | "reply" | "replyAll" | "forward";
  threadId?: string;
  messageId?: string;
  connectionId?: string;
  onSent?: () => void;
  onSentAndArchive?: () => void;
  onClose: () => void;
  /** Convert back to inline sidebar */
  onDock?: () => void;
};

export function PopoutCompose({
  mode,
  threadId,
  messageId,
  connectionId,
  onSent,
  onSentAndArchive,
  onClose,
  onDock,
}: PopoutComposeProps) {
  const defaultW = 520;
  const defaultH = 480;
  const [pos, setPos] = React.useState(() => {
    if (typeof window === "undefined") return { x: 40, y: 40 };
    return {
      x: Math.max(40, Math.floor((window.innerWidth - defaultW) / 2)),
      y: Math.max(40, Math.floor((window.innerHeight - defaultH) / 2)),
    };
  });
  const [size, setSize] = React.useState({ w: defaultW, h: defaultH });
  const [minimized, setMinimized] = React.useState(false);
  const dragging = React.useRef(false);
  const resizing = React.useRef(false);
  const offset = React.useRef({ x: 0, y: 0 });

  const title =
    mode === "compose"
      ? "New Email"
      : mode === "reply"
        ? "Reply"
        : mode === "replyAll"
          ? "Reply All"
          : "Forward";

  // --- Drag logic ---
  const onTitleMouseDown = React.useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - offset.current.y)),
      });
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y]);

  // --- Resize logic (bottom-right corner) ---
  const onResizeMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      setSize({
        w: Math.max(380, Math.min(window.innerWidth - 40, startW + (ev.clientX - startX))),
        h: Math.max(300, Math.min(window.innerHeight - 40, startH + (ev.clientY - startY))),
      });
    };
    const onUp = () => {
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  return (
    <div
      className="fixed z-50 rounded-xl border border-white/15 shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: minimized ? pos.x : pos.x,
        top: minimized ? undefined : pos.y,
        bottom: minimized ? 16 : undefined,
        width: minimized ? Math.min(320, size.w) : size.w,
        height: minimized ? "auto" : size.h,
        backgroundColor: "hsl(var(--surface-2))",
      }}
    >
      {/* Title bar — draggable */}
      <div
        onMouseDown={onTitleMouseDown}
        className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0 cursor-grab active:cursor-grabbing select-none"
        style={{ backgroundColor: "hsl(var(--surface-3))" }}
      >
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <div className="flex items-center gap-1">
          {onDock && (
            <button
              onClick={onDock}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
              title="Dock to sidebar"
            >
              <DockIcon className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => setMinimized((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
            title={minimized ? "Expand" : "Minimize"}
          >
            <MinimizeIcon className="h-3 w-3" minimized={minimized} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
            title="Close"
          >
            <span className="text-sm leading-none">&times;</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {!minimized && (
        <div className="flex-1 overflow-y-auto thin-scroll p-3">
          <ComposeForm
            mode={mode}
            threadId={threadId}
            messageId={messageId}
            connectionId={connectionId}
            onSent={() => {
              onSent?.();
              onClose();
            }}
            onSentAndArchive={() => {
              onSentAndArchive?.();
              onClose();
            }}
            onDiscard={onClose}
            active
            compact
          />
        </div>
      )}

      {/* Resize handle (bottom-right) */}
      {!minimized && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        >
          <svg
            className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 text-muted-foreground/40"
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="4" cy="8" r="1.2" />
            <circle cx="8" cy="4" r="1.2" />
          </svg>
        </div>
      )}
    </div>
  );
}

function DockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function MinimizeIcon({ className, minimized }: { className?: string; minimized: boolean }) {
  if (minimized) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
