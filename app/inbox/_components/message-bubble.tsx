"use client";

import { Clock, ExternalLink, Reply } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { ThreadMessage } from "./inbox-types";

export function MessageBubble({ msg, compact, onReply }: { msg: ThreadMessage; compact?: boolean; onReply?: () => void }) {
  const chatIdStr = String(msg.telegram_chat_id);
  const supergroupId = chatIdStr.startsWith("-100") ? chatIdStr.slice(4) : null;
  const deepLink = supergroupId
    ? `https://t.me/c/${supergroupId}/${msg.telegram_message_id}`
    : null;

  return (
    <div className={cn("flex gap-2", compact ? "py-0.5" : "py-1")}>
      <div className={cn(
        "flex items-center justify-center rounded-full shrink-0 font-bold",
        msg.is_from_bot ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground",
        compact ? "h-5 w-5 text-[8px]" : "h-7 w-7 text-[10px]"
      )}>
        {msg.sender_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("font-medium text-foreground", compact ? "text-[10px]" : "text-xs")}>
            {msg.sender_name}
          </span>
          {msg.sender_username && (
            <span className="text-[10px] text-muted-foreground/50">@{msg.sender_username}</span>
          )}
          <span className="text-[10px] text-muted-foreground/40 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(msg.sent_at)}
          </span>
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/30 hover:text-primary transition-colors"
              title="Open in Telegram"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {onReply && (
            <button
              onClick={(e) => { e.stopPropagation(); onReply(); }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-primary transition-all"
              title="Reply to this message"
            >
              <Reply className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <p className={cn(
          "text-muted-foreground whitespace-pre-wrap break-words",
          compact ? "text-[10px]" : "text-xs"
        )}>
          {msg.message_text ?? `(${msg.message_type})`}
        </p>
      </div>
    </div>
  );
}
