"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Send, X } from "lucide-react";
import { useUndoSend } from "./undo-send-bar";

interface QuickReplyProps {
  threadId: string;
  connectionId?: string;
  onSent?: () => void;
  onClose: () => void;
}

/**
 * Inline quick-reply — a single-line reply field that appears below
 * a thread in the thread list. For fast one-liner responses without
 * opening the full thread view or compose form.
 */
export function QuickReply({ threadId, connectionId, onSent, onClose }: QuickReplyProps) {
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { queueSend } = useUndoSend();

  // Auto-focus on mount
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape to close
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);

    const html = `<div>${text.replace(/\n/g, "<br>")}</div>`;
    const payload: Record<string, unknown> = {
      type: "reply",
      threadId,
      body: html,
      bodyText: text,
      replyAll: false,
      ...(connectionId ? { connection_id: connectionId } : {}),
    };

    queueSend(payload);
    setSending(false);
    setText("");
    onSent?.();
    onClose();
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.03]"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
          // Prevent thread list keyboard shortcuts from firing
          e.stopPropagation();
        }}
        placeholder="Quick reply..."
        className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
      <button
        onClick={handleSend}
        disabled={!text.trim() || sending}
        className={cn(
          "rounded p-1 transition",
          text.trim()
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground/30"
        )}
        title="Send reply (Enter)"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onClose}
        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
        title="Close (Esc)"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
