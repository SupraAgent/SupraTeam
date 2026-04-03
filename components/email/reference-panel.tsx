"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import DOMPurify from "dompurify";
import type { Thread, Message } from "@/lib/email/types";
import { ContactAvatar } from "./contact-avatar";
import { Pin, X, ChevronDown, ChevronUp } from "lucide-react";

interface ReferencePanelProps {
  /** The pinned thread to display as reference */
  thread: Thread | null;
  loading: boolean;
  onClose: () => void;
}

/**
 * Reference panel — pin a second email thread for reference while composing.
 * Shows collapsed messages with expandable bodies, designed to sit alongside
 * the compose form in the inline compose sidebar.
 */
export function ReferencePanel({ thread, loading, onClose }: ReferencePanelProps) {
  const [expandedMsgId, setExpandedMsgId] = React.useState<string | null>(null);

  if (loading) {
    return (
      <div className="border-b border-white/10 px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Pin className="h-3 w-3" />
            <span>Loading reference...</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!thread) return null;

  return (
    <div className="border-b border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-white/5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Pin className="h-3 w-3 text-primary shrink-0" />
          <span className="text-[10px] font-medium text-primary">Reference</span>
          <span className="text-[10px] text-muted-foreground truncate ml-1">
            {thread.subject}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition shrink-0"
          title="Unpin reference"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Compact message list — max height with scroll */}
      <div className="max-h-[200px] overflow-y-auto thin-scroll">
        {thread.messages.map((msg) => (
          <ReferenceMessage
            key={msg.id}
            message={msg}
            expanded={expandedMsgId === msg.id}
            onToggle={() => setExpandedMsgId((prev) => (prev === msg.id ? null : msg.id))}
          />
        ))}
      </div>
    </div>
  );
}

function ReferenceMessage({
  message,
  expanded,
  onToggle,
}: {
  message: Message;
  expanded: boolean;
  onToggle: () => void;
}) {
  const senderName = message.from.name || message.from.email || "Unknown";

  const sanitizedHtml = React.useMemo(() => {
    if (!expanded || !message.body) return "";
    return DOMPurify.sanitize(message.body, {
      ALLOWED_TAGS: ["div", "span", "p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "blockquote"],
      ALLOWED_ATTR: ["href", "target", "rel"],
    });
  }, [expanded, message.body]);

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <ContactAvatar email={message.from.email} name={message.from.name} size={18} />
        <span className="text-[11px] text-foreground/80 truncate flex-1">{senderName}</span>
        <span className="text-[9px] text-muted-foreground shrink-0">{timeAgo(message.date)}</span>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div
          className="px-3 pb-2 text-xs text-foreground/70 prose prose-invert prose-xs max-w-none overflow-hidden"
          style={{ maxHeight: 150, overflowY: "auto" }}
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      )}
      {!expanded && (
        <p className="px-3 pb-1.5 text-[10px] text-muted-foreground/50 truncate">
          {message.bodyText?.slice(0, 80) || message.body?.replace(/<[^>]+>/g, "").slice(0, 80) || ""}
        </p>
      )}
    </div>
  );
}
