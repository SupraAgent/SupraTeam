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
  onSentAndArchive?: () => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function PaperclipIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49" /></svg>;
}

export function ComposeModal({
  open,
  onClose,
  mode,
  threadId,
  messageId,
  prefillTo,
  prefillSubject,
  onSent,
  onSentAndArchive,
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
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
      setAttachments([]);
    }
  }, [open, prefillTo, prefillSubject]);

  function handleFilesAdded(files: File[]) {
    if (files.length === 0) return;
    setAttachments((prev) => {
      const combined = [...prev, ...files];
      let total = 0;
      const filtered = combined.filter((f) => {
        total += f.size;
        return total <= 20 * 1024 * 1024;
      });
      if (total > 20 * 1024 * 1024) {
        setError("Attachments exceed 20MB limit");
      }
      return filtered;
    });
  }

  function parseRecipients(raw: string) {
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ name: "", email }));
  }

  async function buildPayload(): Promise<Record<string, unknown> | null> {
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

    // Inject tracking pixel for read receipts (use absolute URL so it works in email clients)
    const trackingId = crypto.randomUUID();
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const trackingPixel = `<img src="${baseUrl}/api/email/track/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
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

    // Convert attachments to base64 for the API
    if (attachments.length > 0) {
      const attachmentData = await Promise.all(
        attachments.map(async (file) => {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          return { filename: file.name, mimeType: file.type || "application/octet-stream", data: base64 };
        })
      );
      payload.attachments = attachmentData;
    }

    return payload;
  }

  async function handleSend() {
    const payload = await buildPayload();
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
    const payload = await buildPayload();
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
      // Cmd+Shift+Enter to send + archive
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        handleSend().then(() => onSentAndArchive?.());
        return;
      }
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
  }, [open, bodyText, bodyHtml, to, subject, cc, bcc, mode, threadId, messageId, attachments]);

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
        <div
          className="space-y-3"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) handleFilesAdded(files);
          }}
        >
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
              onFilesAdded={handleFilesAdded}
              placeholder="Write your message..."
              autoFocus={mode === "reply" || mode === "replyAll"}
            />
          </div>

          {/* Attachment list */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <div key={`${file.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
                  <PaperclipIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate max-w-[150px]">{file.name}</span>
                  <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground ml-1"
                    type="button"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 relative">
              <Button onClick={handleSend} disabled={sending} size="sm">
                {sending ? "Sending..." : "Send"}
              </Button>

              {onSentAndArchive && (mode === "reply" || mode === "replyAll") && (
                <Button
                  onClick={() => { handleSend().then(() => onSentAndArchive?.()); }}
                  disabled={sending}
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                >
                  Send + Archive
                </Button>
              )}

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

              {/* Attach files button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                title="Attach files"
                type="button"
              >
                <PaperclipIcon className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) handleFilesAdded(files);
                  e.target.value = "";
                }}
              />

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
