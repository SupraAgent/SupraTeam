"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, Send, X, Check, ExternalLink,
} from "lucide-react";

type ActionType = "followup" | "tg_urgent" | "stale" | "reminders";

interface InlineActionCardProps {
  actionType: ActionType;
  icon: React.ElementType;
  iconColor: string;
  label: string;
  detail: string;
  href: string;
  /** Message preview from highlight data */
  messagePreview: string | null;
  /** Sender name from highlight data */
  senderName: string | null;
  /** Telegram chat_id for inline reply */
  chatId: string | null;
  /** Callback after a reply is sent successfully */
  onReply?: (chatId: string, message: string) => void;
  /** Callback when the item is dismissed / marked as handled */
  onDismiss?: () => void;
}

export function InlineActionCard({
  actionType,
  icon: Icon,
  iconColor,
  label,
  detail,
  href,
  messagePreview,
  senderName,
  chatId,
  onReply,
  onDismiss,
}: InlineActionCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  if (dismissed) return null;

  const canReply = actionType === "tg_urgent" && chatId;

  async function handleSendReply() {
    if (!replyText.trim() || !chatId) return;
    setSending(true);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(chatId),
          message: replyText.trim(),
        }),
      });
      if (res.ok) {
        setSent(true);
        setReplyText("");
        onReply?.(chatId, replyText.trim());
        // Auto-collapse after short delay
        setTimeout(() => {
          setExpanded(false);
          setSent(false);
        }, 1500);
      }
    } catch {
      // silent — user can retry
    } finally {
      setSending(false);
    }
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed(true);
    onDismiss?.();
  }

  const iconBgClass = iconColor.replace("text-", "bg-").replace("-400", "-500/15");

  return (
    <div className="rounded-lg bg-white/[0.03] transition overflow-hidden">
      {/* Collapsed row — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded((prev: boolean) => !prev)}
        className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/[0.06] transition text-left group"
      >
        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", iconBgClass)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{detail}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground/50 transition" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/5">
            {/* Message preview */}
            {(messagePreview || senderName) && (
              <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                {senderName && (
                  <p className="text-xs font-medium text-foreground mb-0.5">{senderName}</p>
                )}
                {messagePreview && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{messagePreview}</p>
                )}
              </div>
            )}

            {/* Inline reply input — only for TG urgent items with chat_id */}
            {canReply && (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder="Type a quick reply..."
                  disabled={sending || sent}
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sending || sent}
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center transition shrink-0",
                    sent
                      ? "bg-green-500/20 text-green-400"
                      : "bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:hover:bg-primary/10",
                  )}
                >
                  {sent ? <Check className="h-4 w-4" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

            {/* Action buttons row */}
            <div className="flex items-center gap-2">
              <Link
                href={href}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                Open in {actionType === "tg_urgent" ? "Inbox" : actionType === "reminders" ? "Calendar" : "Pipeline"}
              </Link>
              <div className="flex-1" />
              <button
                onClick={handleDismiss}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 rounded-lg hover:bg-white/[0.05]"
              >
                <X className="h-3 w-3" />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
