"use client";

import * as React from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { Thread, Message } from "@/lib/email/types";
import { ContactAvatar } from "./contact-avatar";
import { ThreadCrmLinks } from "./thread-crm-links";
import { ReadReceiptIndicator } from "./read-receipt-indicator";

type ThreadViewProps = {
  thread: Thread;
  loading: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: (messageId: string) => void;
  onArchive: () => void;
  onTrash: () => void;
  onStar: () => void;
  onMarkUnread: () => void;
  onBack: () => void;
};

export function ThreadView({
  thread,
  loading,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onTrash,
  onStar,
  onMarkUnread,
  onBack,
}: ThreadViewProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading thread...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="md:hidden text-muted-foreground hover:text-foreground transition shrink-0"
          >
            <BackIcon className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-medium text-foreground truncate">
            {thread.subject}
          </h2>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <ActionButton title="Archive (e)" onClick={onArchive}>
            <ArchiveIcon className="h-4 w-4" />
          </ActionButton>
          <ActionButton title="Trash (#)" onClick={onTrash}>
            <TrashIcon className="h-4 w-4" />
          </ActionButton>
          <ActionButton title="Star (s)" onClick={onStar}>
            {thread.isStarred ? (
              <StarFilledIcon className="h-4 w-4 text-yellow-400" />
            ) : (
              <StarIcon className="h-4 w-4" />
            )}
          </ActionButton>
          <ActionButton title="Mark unread (u)" onClick={onMarkUnread}>
            <MailIcon className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>

      {/* CRM auto-links */}
      <ThreadCrmLinks
        threadId={thread.id}
        fromEmails={thread.from.map((a) => a.email)}
        toEmails={thread.to.map((a) => a.email)}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-3">
        {thread.messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={i === thread.messages.length - 1}
            onForward={() => onForward(msg.id)}
          />
        ))}
      </div>

      {/* Reply bar */}
      <div className="border-t border-white/10 px-4 py-3 flex items-center gap-2 shrink-0">
        <button
          onClick={onReply}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
        >
          <ReplyIcon className="h-3.5 w-3.5" />
          Reply
        </button>
        <button
          onClick={onReplyAll}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
        >
          <ReplyAllIcon className="h-3.5 w-3.5" />
          Reply All
        </button>
        <button
          onClick={() => onForward(thread.messages[thread.messages.length - 1]?.id)}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
        >
          <ForwardIcon className="h-3.5 w-3.5" />
          Forward
        </button>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isLast,
  onForward,
}: {
  message: Message;
  isLast: boolean;
  onForward: () => void;
}) {
  const [expanded, setExpanded] = React.useState(isLast);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Message header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ContactAvatar
            email={message.from.email}
            name={message.from.name}
            size={28}
          />
          <div className="min-w-0">
            <span className={cn("text-xs", message.isUnread ? "font-semibold text-foreground" : "text-foreground/80")}>
              {message.from.name || message.from.email}
            </span>
            {!expanded && (
              <span className="text-[10px] text-muted-foreground/50 ml-2 truncate">
                {message.bodyText.slice(0, 80)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <ReadReceiptIndicator trackingId={message.id} className="relative" />
          <span className="text-[10px] text-muted-foreground">
            {timeAgo(message.date)}
          </span>
        </div>
      </button>

      {/* Message body */}
      {expanded && (
        <div className="px-4 pb-3">
          {/* To/CC */}
          <div className="text-[10px] text-muted-foreground mb-3 space-y-0.5">
            <p>To: {message.to.map((a) => a.name || a.email).join(", ")}</p>
            {message.cc.length > 0 && (
              <p>Cc: {message.cc.map((a) => a.name || a.email).join(", ")}</p>
            )}
          </div>

          {/* Body — rendered as sanitized HTML (memoized to avoid re-sanitizing on every render) */}
          <SanitizedBody body={message.body} bodyText={message.bodyText} />

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-foreground"
                >
                  <PaperclipIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate max-w-[150px]">{att.filename}</span>
                  <span className="text-muted-foreground/50">{formatSize(att.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "div", "span", "p", "br", "a", "b", "strong", "i", "em", "u",
    "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "td", "th",
    "img", "blockquote", "pre", "code", "hr",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "width", "height", "target", "rel", "class"],
};

const SanitizedBody = React.memo(function SanitizedBody({ body, bodyText }: { body: string; bodyText: string }) {
  const html = React.useMemo(
    () => DOMPurify.sanitize(body || bodyText.replace(/\n/g, "<br>"), PURIFY_CONFIG),
    [body, bodyText]
  );
  return (
    <div
      className="text-sm text-foreground/90 prose prose-invert prose-sm max-w-none
        [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline
        [&_img]:max-w-full [&_img]:rounded-lg
        [&_blockquote]:border-l-2 [&_blockquote]:border-white/10 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Action button wrapper
function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
    >
      {children}
    </button>
  );
}

// ── Inline SVGs ──────────────────────────────────────────────

function BackIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>;
}

function ArchiveIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>;
}

function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
}

function StarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

function StarFilledIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

function MailIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></svg>;
}

function ReplyIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" /></svg>;
}

function ReplyAllIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 2 12 7 7" /><polyline points="12 17 7 12 12 7" /><path d="M22 18v-2a4 4 0 00-4-4H7" /></svg>;
}

function ForwardIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7" /><path d="M4 18v-2a4 4 0 014-4h12" /></svg>;
}

function PaperclipIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>;
}
