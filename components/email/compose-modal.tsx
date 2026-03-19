"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichEditor } from "./rich-editor";
import { TemplatePicker } from "./template-picker";
import { SendLaterPicker } from "./send-later-picker";
import { useUndoSend } from "./undo-send-bar";
import type { EmailTemplate } from "@/lib/email/types";

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
  const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false);
  const [sendLaterOpen, setSendLaterOpen] = React.useState(false);
  const [signature, setSignature] = React.useState("");

  const { queueSend } = useUndoSend();

  // Fetch signature on mount
  React.useEffect(() => {
    fetch("/api/email/signatures")
      .then((r) => r.json())
      .then((json) => {
        const sig = (json.data ?? [])[0];
        if (sig?.signature_html) setSignature(sig.signature_html);
      })
      .catch(() => {});
  }, []);

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
      setTemplatePickerOpen(false);
      setSendLaterOpen(false);
    }
  }, [open, prefillTo, prefillSubject]);

  function parseRecipients(raw: string) {
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ name: "", email }));
  }

  function buildPayload(): Record<string, unknown> | null {
    if (mode === "compose" || mode === "forward") {
      if (!to.trim()) {
        setError("Recipients required");
        return null;
      }
    }
    if (!bodyText.trim()) {
      setError("Message body required");
      return null;
    }

    // Build HTML body with signature and tracking pixel
    let html = bodyHtml || `<div>${bodyText.replace(/\n/g, "<br>")}</div>`;

    // Append signature
    if (signature) {
      html += `<br><div style="color:#999;font-size:12px;border-top:1px solid #333;padding-top:8px;margin-top:16px">${signature}</div>`;
    }

    // Inject tracking pixel for read receipts
    const trackingId = crypto.randomUUID();
    const trackingPixel = `<img src="/api/email/track/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
    html += trackingPixel;

    const payload: Record<string, unknown> = {
      type: mode === "replyAll" ? "reply" : mode,
      body: html,
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

    return payload;
  }

  async function handleSend() {
    const payload = buildPayload();
    if (!payload) return;

    setSending(true);
    setError("");

    // Queue with 60s undo window instead of sending immediately
    queueSend(payload);
    onSent?.();
    onClose();
    setSending(false);
  }

  async function handleSendLater(scheduledFor: string) {
    const payload = buildPayload();
    if (!payload) return;

    setSending(true);
    setError("");

    try {
      // Get default connection
      const connRes = await fetch("/api/email/connections");
      const connJson = await connRes.json();
      const defaultConn = (connJson.data ?? []).find((c: { is_default: boolean }) => c.is_default) ?? connJson.data?.[0];

      if (!defaultConn) {
        setError("No email connection");
        return;
      }

      await fetch("/api/email/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_later",
          connection_id: defaultConn.id,
          draft_data: payload,
          scheduled_for: scheduledFor,
        }),
      });

      onClose();
    } catch {
      setError("Failed to schedule");
    } finally {
      setSending(false);
    }
  }

  function handleTemplateSelect(template: EmailTemplate) {
    setBodyHtml(template.body);
    setBodyText(template.body.replace(/<[^>]+>/g, ""));
    if (template.subject && (mode === "compose" || mode === "forward")) {
      setSubject(template.subject);
    }
  }

  // Keyboard shortcuts
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      // Cmd+Enter to send
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
      // Cmd+; for templates
      if ((e.metaKey || e.ctrlKey) && e.key === ";") {
        e.preventDefault();
        setTemplatePickerOpen(true);
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
    <>
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
            <div className="flex items-center gap-2 relative">
              <Button onClick={handleSend} disabled={sending} size="sm">
                {sending ? "Sending..." : "Send"}
              </Button>

              {/* Send later dropdown trigger */}
              <button
                onClick={() => setSendLaterOpen(!sendLaterOpen)}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                title="Send later"
              >
                <ClockIcon className="h-3.5 w-3.5" />
              </button>

              {/* Template button */}
              <button
                onClick={() => setTemplatePickerOpen(true)}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                title="Insert template (⌘;)"
              >
                <TemplateIcon className="h-3.5 w-3.5" />
              </button>

              <span className="text-[10px] text-muted-foreground">
                {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter
              </span>

              {/* Send later picker */}
              <SendLaterPicker
                open={sendLaterOpen}
                onClose={() => setSendLaterOpen(false)}
                onSchedule={handleSendLater}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Discard
            </Button>
          </div>
        </div>
      </Modal>

      {/* Template picker overlay */}
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={handleTemplateSelect}
      />
    </>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}

function TemplateIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}
