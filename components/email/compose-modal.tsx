"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichEditor } from "./rich-editor";

type ComposeModalProps = {
  open: boolean;
  onClose: () => void;
  mode: "compose" | "reply" | "replyAll" | "forward";
  threadId?: string;
  messageId?: string;
  prefillTo?: string;
  prefillSubject?: string;
  onSent?: () => void;
};

export function ComposeModal({
  open,
  onClose,
  mode,
  threadId,
  messageId,
  prefillTo,
  prefillSubject,
  onSent,
}: ComposeModalProps) {
  const [to, setTo] = React.useState(prefillTo ?? "");
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  const [subject, setSubject] = React.useState(prefillSubject ?? "");
  const [bodyHtml, setBodyHtml] = React.useState("");
  const [bodyText, setBodyText] = React.useState("");
  const [showCcBcc, setShowCcBcc] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      if (!prefillTo) setTo("");
      setCc("");
      setBcc("");
      if (!prefillSubject) setSubject("");
      setBodyHtml("");
      setBodyText("");
      setShowCcBcc(false);
      setError("");
    }
  }, [open, prefillTo, prefillSubject]);

  function parseRecipients(raw: string) {
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ name: "", email }));
  }

  async function handleSend() {
    if (mode === "compose" || mode === "forward") {
      if (!to.trim()) {
        setError("Recipients required");
        return;
      }
    }
    if (!bodyText.trim()) {
      setError("Message body required");
      return;
    }

    setSending(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        type: mode === "replyAll" ? "reply" : mode,
        body: bodyHtml || `<div>${bodyText.replace(/\n/g, "<br>")}</div>`,
        bodyText,
      };

      if (mode === "compose" || mode === "forward") {
        payload.to = parseRecipients(to);
        payload.subject = subject;
        if (mode === "forward") payload.messageId = messageId;
      }

      if (mode === "reply" || mode === "replyAll") {
        payload.threadId = threadId;
        payload.replyAll = mode === "replyAll";
      }

      if (cc.trim()) payload.cc = parseRecipients(cc);
      if (bcc.trim()) payload.bcc = parseRecipients(bcc);

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Failed to send");
        return;
      }

      onSent?.();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  // Cmd+Enter to send (captured from RichEditor's contenteditable)
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, bodyText, bodyHtml, to, subject, cc, bcc, mode, threadId, messageId]);

  const title =
    mode === "compose"
      ? "New Email"
      : mode === "reply"
        ? "Reply"
        : mode === "replyAll"
          ? "Reply All"
          : "Forward";

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        {/* To (hidden for reply/replyAll) */}
        {(mode === "compose" || mode === "forward") && (
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-[10px] text-muted-foreground mb-1">To</label>
              {!showCcBcc && (
                <button
                  onClick={() => setShowCcBcc(true)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Cc/Bcc
                </button>
              )}
            </div>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="text-xs"
            />
          </div>
        )}

        {showCcBcc && (
          <>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">Cc</label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">Bcc</label>
              <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com" className="text-xs" />
            </div>
          </>
        )}

        {(mode === "compose" || mode === "forward") && (
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="text-xs"
            />
          </div>
        )}

        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">Message</label>
          <RichEditor
            content={bodyHtml}
            onChange={(html, text) => {
              setBodyHtml(html);
              setBodyText(text);
            }}
            placeholder="Write your message..."
            autoFocus={mode === "reply" || mode === "replyAll"}
          />
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Button onClick={handleSend} disabled={sending} size="sm">
              {sending ? "Sending..." : "Send"}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Discard
          </Button>
        </div>
      </div>
    </Modal>
  );
}
