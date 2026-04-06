"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Clock,
  Eye,
  MessageCircle,
  FileText,
  X,
  AlertTriangle,
  Save,
  Image,
  Paperclip,
  Trash2,
  Plus,
  Upload,
  Link,
  Users,
  Check,
} from "lucide-react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MergeVariablePicker } from "./MergeVariablePicker";
import type { TgGroup, BroadcastResult, BotTemplate } from "./types";

interface BroadcastComposeProps {
  groups: TgGroup[];
  selectedGroupIds: Set<string>;
  totalRecipients: number;
  selectedSlug: string | null;
  templates: BotTemplate[];
  showHistory: boolean;
  onSendComplete: () => void;
}

export function BroadcastCompose({
  groups,
  selectedGroupIds,
  totalRecipients,
  selectedSlug,
  templates,
  showHistory,
  onSendComplete,
}: BroadcastComposeProps) {
  const [message, setMessage] = React.useState("");
  const [showPreview, setShowPreview] = React.useState(false);
  const [scheduleMode, setScheduleMode] = React.useState(false);
  const [scheduleDate, setScheduleDate] = React.useState("");
  const [scheduleTime, setScheduleTime] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [results, setResults] = React.useState<BroadcastResult[] | null>(null);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [showTemplates, setShowTemplates] = React.useState(false);

  // Suppression rules
  const [suppressionHours, setSuppressionHours] = React.useState<number | null>(null);
  const [excludeStageIds, setExcludeStageIds] = React.useState<Set<string>>(new Set());
  const [pipelineStages, setPipelineStages] = React.useState<Array<{ id: string; name: string }>>([]);

  // Rich media
  const [mediaType, setMediaType] = React.useState<"photo" | "document" | null>(null);
  const [mediaFileId, setMediaFileId] = React.useState<string | null>(null);
  const [mediaFilename, setMediaFilename] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Inline buttons
  const [inlineButtons, setInlineButtons] = React.useState<Array<{ text: string; url: string }>>([]);

  // Formatting
  // Cursor position (no state needed — tracked via textarea ref)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Draft auto-save
  React.useEffect(() => {
    const saved = localStorage.getItem("broadcast_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.message) setMessage(draft.message);
        if (draft.scheduleDate) { setScheduleDate(draft.scheduleDate); setScheduleMode(true); }
        if (draft.scheduleTime) setScheduleTime(draft.scheduleTime);
      } catch { /* ignore */ }
    }
  }, []);

  React.useEffect(() => {
    if (message.trim()) {
      localStorage.setItem("broadcast_draft", JSON.stringify({
        message, scheduleDate, scheduleTime,
      }));
    } else {
      localStorage.removeItem("broadcast_draft");
    }
  }, [message, scheduleDate, scheduleTime]);

  React.useEffect(() => {
    fetch("/api/pipeline").then((r) => r.json()).then((d) => setPipelineStages(d.stages ?? [])).catch(() => {});
  }, []);

  function insertFormatting(tag: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = message.slice(start, end);
    const wrapped = `<${tag}>${selected}</${tag}>`;
    setMessage(message.slice(0, start) + wrapped + message.slice(end));
    setTimeout(() => {
      ta.focus();
      const newPos = selected ? start + wrapped.length : start + tag.length + 2;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  async function handleMediaUpload(file: File, type: "photo" | "document") {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("media_type", type);
      const res = await fetch("/api/broadcasts/upload-media", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        setMediaType(type);
        setMediaFileId(data.file_id);
        setMediaFilename(data.filename);
        toast.success(`${type === "photo" ? "Photo" : "Document"} uploaded`);
      } else {
        toast.error(data.error ?? "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeMedia() {
    setMediaType(null);
    setMediaFileId(null);
    setMediaFilename(null);
  }

  function addInlineButton() {
    setInlineButtons((prev) => [...prev, { text: "", url: "" }]);
  }

  function updateInlineButton(idx: number, field: "text" | "url", value: string) {
    // Telegram callback_data/URL button text is limited to 64 bytes
    if (field === "text" && new TextEncoder().encode(value).length > 64) return;
    setInlineButtons((prev) => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  }

  function removeInlineButton(idx: number) {
    setInlineButtons((prev) => prev.filter((_, i) => i !== idx));
  }

  function requestSend() {
    if (!message.trim() || selectedGroupIds.size === 0) return;
    setShowConfirm(true);
  }

  async function handleSend() {
    setShowConfirm(false);
    if (!message.trim() || selectedGroupIds.size === 0) return;
    setSending(true);
    setResults(null);
    try {
      const body: Record<string, unknown> = {
        message: message.trim(),
        group_ids: [...selectedGroupIds],
        slug: selectedSlug ?? undefined,
      };

      if (scheduleMode && scheduleDate && scheduleTime) {
        body.scheduled_at = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      }
      if (suppressionHours) body.suppression_hours = suppressionHours;
      if (excludeStageIds.size > 0) body.exclude_stage_ids = [...excludeStageIds];
      if (mediaType && mediaFileId) {
        body.media_type = mediaType;
        body.media_file_id = mediaFileId;
        body.media_filename = mediaFilename;
      }
      const validButtons = inlineButtons.filter((b) => b.text.trim() && b.url.trim());
      if (validButtons.length > 0) body.inline_buttons = validButtons;

      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.removeItem("broadcast_draft");
        if (data.scheduled) {
          toast.success(`Broadcast scheduled for ${scheduleDate} ${scheduleTime}`);
          setMessage("");
          setScheduleMode(false);
          setScheduleDate("");
          setScheduleTime("");
        } else {
          setResults(data.results);
          toast.success(`Sent to ${data.sent}/${data.total} groups`);
          if (data.sent === data.total) {
            setMessage("");
            removeMedia();
            setInlineButtons([]);
          }
        }
        // Refresh history if visible
        if (showHistory) onSendComplete();
      } else {
        toast.error(data.error ?? "Failed to send");
      }
    } finally {
      setSending(false);
    }
  }

  // Allow parent to load a message (reuse from history)
  const loadMessage = React.useCallback((text: string) => {
    setMessage(text);
  }, []);

  // Expose loadMessage via ref-like pattern through window (or we could use a callback prop)
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__broadcastComposeLoadMessage = loadMessage;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__broadcastComposeLoadMessage;
    };
  }, [loadMessage]);

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              Compose Message
            </h2>
            {templates.length > 0 && (
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  showTemplates ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5"
                )}
              >
                <FileText className="h-3 w-3" />
                Templates
              </button>
            )}
          </div>

          {/* Template picker */}
          {showTemplates && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 space-y-1">
              <p className="text-[10px] text-muted-foreground px-2 py-1">
                Pick a template to use as your message body
              </p>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setMessage(tpl.body_template);
                    setShowTemplates(false);
                    toast.success(`Template "${tpl.name}" loaded`);
                  }}
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 transition-colors"
                >
                  <p className="text-xs font-medium text-foreground">{tpl.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                    {tpl.body_template.slice(0, 80)}
                    {tpl.body_template.length > 80 ? "..." : ""}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Merge variable picker */}
          <MergeVariablePicker
            onInsert={(token) => {
              const ta = textareaRef.current;
              if (!ta) return;
              const pos = ta.selectionStart;
              setMessage(message.slice(0, pos) + token + message.slice(pos));
              setTimeout(() => {
                ta.focus();
                ta.setSelectionRange(pos + token.length, pos + token.length);
              }, 0);
            }}
          />

          {/* Formatting toolbar */}
          <div className="flex items-center gap-1 border-b border-white/5 pb-2">
            <button
              onClick={() => insertFormatting("b")}
              className="rounded px-3 py-2 min-h-[44px] text-xs font-bold text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
            >
              B
            </button>
            <button
              onClick={() => insertFormatting("i")}
              className="rounded px-3 py-2 min-h-[44px] text-xs italic text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
            >
              I
            </button>
            <button
              onClick={() => insertFormatting("u")}
              className="rounded px-3 py-2 min-h-[44px] text-xs underline text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
            >
              U
            </button>
            <button
              onClick={() => insertFormatting("code")}
              className="rounded px-3 py-2 min-h-[44px] text-xs font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition"
            >
              {"</>"}
            </button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                "rounded px-3 py-2 min-h-[44px] text-xs flex items-center gap-1.5 transition",
                showPreview
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-white/5"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>

          {showPreview ? (
            <div className="min-h-[160px] rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">
                Telegram Preview
              </p>
              <div
                className="text-sm text-foreground whitespace-pre-wrap [&_code]:bg-white/10 [&_code]:px-1 [&_code]:rounded"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(message, {
                    ALLOWED_TAGS: ["b", "i", "u", "s", "code", "pre", "a"],
                    ALLOWED_ATTR: ["href"],
                  }),
                }}
              />
            </div>
          ) : (
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your broadcast message...&#10;&#10;Formatting: <b>bold</b>, <i>italic</i>, <u>underline</u>, <code>code</code>"
              className="min-h-[160px] font-mono text-sm"
            />
          )}

          {/* Media attachment */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={mediaType === "document" ? "*/*" : "image/*"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const type = file.type.startsWith("image/") ? "photo" as const : "document" as const;
                handleMediaUpload(file, type);
                e.target.value = "";
              }}
            />
            {mediaFileId ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                {mediaType === "photo" ? <Image className="h-4 w-4 text-blue-400 shrink-0" /> : <Paperclip className="h-4 w-4 text-emerald-400 shrink-0" />}
                <span className="text-xs text-foreground truncate flex-1">{mediaFilename ?? "Attached file"}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{mediaType}</span>
                <button onClick={removeMedia} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { fileInputRef.current?.setAttribute("accept", "image/*"); fileInputRef.current?.click(); }}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors"
                >
                  {uploading ? <Upload className="h-3 w-3 animate-pulse" /> : <Image className="h-3 w-3" />}
                  Photo
                </button>
                <button
                  onClick={() => { fileInputRef.current?.setAttribute("accept", "*/*"); fileInputRef.current?.click(); }}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors"
                >
                  {uploading ? <Upload className="h-3 w-3 animate-pulse" /> : <Paperclip className="h-3 w-3" />}
                  Document
                </button>
              </div>
            )}
          </div>

          {/* Inline buttons builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Link className="h-3 w-3" /> Inline Buttons
              </span>
              {inlineButtons.length < 3 && (
                <button onClick={addInlineButton} className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors">
                  <Plus className="h-3 w-3" /> Add Button
                </button>
              )}
            </div>
            {inlineButtons.map((btn, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={btn.text}
                  onChange={(e) => updateInlineButton(idx, "text", e.target.value)}
                  placeholder="Button text"
                  className="h-7 text-xs flex-1"
                />
                <Input
                  value={btn.url}
                  onChange={(e) => updateInlineButton(idx, "url", e.target.value)}
                  placeholder="https://..."
                  className="h-7 text-xs flex-1"
                />
                <button onClick={() => removeInlineButton(idx)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Schedule toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setScheduleMode(!scheduleMode)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                scheduleMode
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "text-muted-foreground hover:bg-white/5"
              )}
            >
              <Clock className="h-3 w-3" />
              {scheduleMode ? "Scheduled" : "Schedule for later"}
            </button>

            {scheduleMode && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="h-8 w-28 text-xs"
                />
              </div>
            )}
          </div>

          {/* Suppression rules */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={suppressionHours ?? ""}
              onChange={(e) => setSuppressionHours(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[11px] text-muted-foreground"
              title="Skip groups that received a broadcast within this window"
            >
              <option value="">No suppression</option>
              <option value="12">Suppress 12h</option>
              <option value="24">Suppress 24h</option>
              <option value="48">Suppress 48h</option>
              <option value="72">Suppress 72h</option>
            </select>
            {pipelineStages.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setExcludeStageIds((prev) => new Set([...prev, e.target.value]));
                    e.target.value = "";
                  }
                }}
                className="rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[11px] text-muted-foreground"
                title="Exclude groups linked to deals at these stages"
              >
                <option value="">Exclude stage...</option>
                {pipelineStages.filter((s) => !excludeStageIds.has(s.id)).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            {[...excludeStageIds].map((sid) => {
              const stage = pipelineStages.find((s) => s.id === sid);
              return stage ? (
                <span key={sid} className="flex items-center gap-1 rounded bg-red-500/10 text-red-400 px-2 py-0.5 text-[10px]">
                  {stage.name}
                  <button onClick={() => setExcludeStageIds((prev) => { const n = new Set(prev); n.delete(sid); return n; })} className="hover:text-red-300">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ) : null;
            })}
          </div>

          {/* Audience preview panel */}
          {selectedGroupIds.size > 0 && (() => {
            const selectedGroups = groups.filter((g) => selectedGroupIds.has(g.id));
            const notAdmin = selectedGroups.filter((g) => !g.bot_is_admin);
            const noMembers = selectedGroups.filter((g) => !g.member_count);
            return (
              <div className={cn(
                "rounded-lg border p-2.5 text-xs space-y-1.5",
                notAdmin.length > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-white/[0.02]"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Audience Preview
                  </span>
                  <span className="text-foreground font-medium">
                    {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""} &middot; ~{totalRecipients.toLocaleString()} recipients
                  </span>
                </div>
                {notAdmin.length > 0 && (
                  <p className="text-[10px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                    Bot is not admin in {notAdmin.length} group{notAdmin.length !== 1 ? "s" : ""} — delivery will fail: {notAdmin.slice(0, 3).map((g) => g.group_name).join(", ")}{notAdmin.length > 3 ? ` +${notAdmin.length - 3} more` : ""}
                  </p>
                )}
                {noMembers.length > 0 && noMembers.length < selectedGroups.length && (
                  <p className="text-[10px] text-muted-foreground/60">
                    {noMembers.length} group{noMembers.length !== 1 ? "s" : ""} with unknown member count — recipient estimate may be low
                  </p>
                )}
              </div>
            );
          })()}

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p className="flex items-center gap-1.5">
                {(() => {
                  const charLimit = mediaFileId ? 1024 : 4096;
                  const warnAt = mediaFileId ? 900 : 3600;
                  return (
                    <span className={cn(
                      message.length > charLimit ? "text-red-400 font-medium" : message.length > warnAt ? "text-amber-400" : ""
                    )}>
                      {message.length.toLocaleString()}/{charLimit.toLocaleString()}
                      {mediaFileId && <span className="text-muted-foreground/60 ml-1">(caption)</span>}
                    </span>
                  );
                })()}
                <span className="text-white/20">|</span>
                {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""} selected
              </p>
              {message.length > (mediaFileId ? 1024 : 4096) && (
                <p className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> Exceeds Telegram&apos;s {mediaFileId ? "1024 caption" : "4096 character"} limit
                </p>
              )}
              {message.trim() && (
                <p className="text-[10px] text-emerald-400/60 flex items-center gap-1">
                  <Save className="h-2.5 w-2.5" /> Draft auto-saved
                </p>
              )}
            </div>
            <Button
              onClick={requestSend}
              disabled={
                sending ||
                !message.trim() ||
                message.length > (mediaFileId ? 1024 : 4096) ||
                selectedGroupIds.size === 0 ||
                (scheduleMode && (!scheduleDate || !scheduleTime))
              }
            >
              {scheduleMode ? (
                <>
                  <Clock className="mr-1 h-3.5 w-3.5" />
                  Schedule
                </>
              ) : (
                <>
                  <Send className="mr-1 h-3.5 w-3.5" />
                  {sending
                    ? "Sending..."
                    : `Send to ${selectedGroupIds.size} group${selectedGroupIds.size !== 1 ? "s" : ""}`}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {results && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-2">
            <h2 className="text-sm font-medium text-foreground">
              Delivery Results
            </h2>
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
              >
                <span className="text-xs text-foreground">{r.group_name}</span>
                {r.success ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="h-3 w-3" /> Sent
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1 text-xs text-red-400"
                    title={r.error}
                  >
                    <X className="h-3 w-3" /> Failed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[hsl(225,35%,8%)] p-5 sm:p-6 shadow-xl space-y-4 safe-area-bottom">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Confirm Broadcast</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
              <p className="text-xs text-muted-foreground line-clamp-3">{message}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""}</span>
                {totalRecipients > 0 && <span>~{totalRecipients.toLocaleString()} recipients</span>}
                {scheduleMode && scheduleDate && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{scheduleDate} {scheduleTime}</span>}
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <Button variant="ghost" className="min-h-[44px]" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button className="min-h-[44px]" onClick={handleSend}>
                <Send className="mr-1.5 h-4 w-4" />
                {scheduleMode ? "Confirm Schedule" : "Confirm Send"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
