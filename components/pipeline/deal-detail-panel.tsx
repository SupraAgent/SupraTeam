"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Deal, PipelineStage, Contact } from "@/lib/types";
import { timeAgo, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  MessageCircle, Save, Trash2, Send, GitBranch, StickyNote, ExternalLink, FileText, Plus, Clock,
} from "lucide-react";
import Link from "next/link";
import { ConversationTimeline } from "./conversation-timeline";

type Note = {
  id: string;
  text: string;
  created_at: string;
};

type Activity = {
  id: string;
  type: "stage_change" | "note" | "tg_message" | "created";
  title: string;
  body?: string;
  tg_deep_link?: string;
  created_at: string;
};

type DealDetailPanelProps = {
  deal: Deal | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated?: () => void;
};

type LinkedDoc = {
  id: string;
  title: string;
  updated_at: string;
};

type Tab = "details" | "conversation" | "activity" | "docs";

export function DealDetailPanel({ deal, open, onClose, onDeleted, onUpdated }: DealDetailPanelProps) {
  const [tab, setTab] = React.useState<Tab>("details");
  const [deleting, setDeleting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Editable fields
  const [dealName, setDealName] = React.useState("");
  const [value, setValue] = React.useState("");
  const [probability, setProbability] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [boardType, setBoardType] = React.useState("");
  const [tgLink, setTgLink] = React.useState("");

  // Stages + contacts for selectors
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [loadingContent, setLoadingContent] = React.useState(true);

  // Notes
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [newNote, setNewNote] = React.useState("");
  const [sendingNote, setSendingNote] = React.useState(false);

  // Activity
  const [activities, setActivities] = React.useState<Activity[]>([]);

  // Linked docs
  const [linkedDocs, setLinkedDocs] = React.useState<LinkedDoc[]>([]);

  // Task creation
  const [showTaskForm, setShowTaskForm] = React.useState(false);
  const [taskMessage, setTaskMessage] = React.useState("");
  const [taskDue, setTaskDue] = React.useState("");
  const [creatingTask, setCreatingTask] = React.useState(false);

  // AI Sentiment
  type SentimentData = {
    overall_sentiment: string;
    confidence: number;
    engagement_level: string;
    tone_keywords: string[];
    risk_signals: string[];
    momentum: string;
    summary: string;
  };
  const [sentiment, setSentiment] = React.useState<SentimentData | null>(null);
  const [sentimentLoading, setSentimentLoading] = React.useState(false);

  // AI Summary
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);

  // Custom fields
  type CustomField = { id: string; field_name: string; label: string; field_type: string; options: string[] | null; required: boolean; board_type: string | null };
  const [customFields, setCustomFields] = React.useState<CustomField[]>([]);
  const [customValues, setCustomValues] = React.useState<Record<string, string>>({});

  // Load deal data into editable state
  React.useEffect(() => {
    if (deal && open) {
      setDealName(deal.deal_name);
      setValue(deal.value != null ? String(deal.value) : "");
      setProbability(deal.probability != null ? String(deal.probability) : "");
      setStageId(deal.stage_id ?? "");
      setBoardType(deal.board_type);
      setTgLink(deal.telegram_chat_link ?? "");
      setTab("details");
      setLoadingContent(true);

      Promise.all([
        fetch("/api/pipeline").then((r) => r.json()).then((d) => setStages(d.stages ?? [])).catch(() => {}),
        fetch(`/api/deals/${deal.id}/notes`).then((r) => r.json()).then((d) => setNotes(d.notes ?? [])).catch(() => setNotes([])),
        fetch(`/api/deals/${deal.id}/activity`).then((r) => r.json()).then((d) => setActivities(d.activities ?? [])).catch(() => setActivities([])),
        fetch(`/api/docs?entity_type=deal&entity_id=${deal.id}`).then((r) => r.json()).then((d) => setLinkedDocs(d.docs ?? [])).catch(() => setLinkedDocs([])),
        fetch("/api/pipeline/fields").then((r) => r.json()).then((d) => setCustomFields(d.fields ?? [])).catch(() => {}),
        fetch(`/api/deals/${deal.id}`).then((r) => r.json()).then((d) => setCustomValues(d.custom_fields ?? {})).catch(() => {}),
        fetch(`/api/deals/${deal.id}/sentiment`).then((r) => r.json()).then((d) => setSentiment(d.sentiment ?? null)).catch(() => setSentiment(null)),
        fetch(`/api/deals/${deal.id}/summary`).then((r) => r.json()).then((d) => setAiSummary(d.summary ?? null)).catch(() => setAiSummary(null)),
      ]).finally(() => setLoadingContent(false));
    }
  }, [deal, open]);

  if (!deal) return null;

  async function handleSave() {
    if (!deal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_name: dealName,
          value: value ? Number(value) : null,
          probability: probability ? Number(probability) : null,
          stage_id: stageId || null,
          board_type: boardType,
          telegram_chat_link: tgLink || null,
          custom_fields: customValues,
        }),
      });
      if (res.ok) {
        toast.success("Deal updated");
        onUpdated?.();
      } else {
        toast.error("Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleOutcome(outcome: "open" | "won" | "lost") {
    if (!deal) return;
    const res = await fetch(`/api/deals/${deal.id}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    if (res.ok) {
      toast.success(`Deal marked as ${outcome}`);
      onUpdated?.();
    } else {
      toast.error("Failed to update outcome");
    }
  }

  async function handleAddNote() {
    if (!deal || !newNote.trim()) return;
    setSendingNote(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newNote }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => [data.note, ...prev]);
        setNewNote("");
        toast.success("Note added");
      }
    } finally {
      setSendingNote(false);
    }
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Deal deleted");
        onDeleted();
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!deal || !taskMessage.trim()) return;
    setCreatingTask(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: taskMessage.trim(),
          deal_id: deal.id,
          due_at: taskDue ? new Date(taskDue).toISOString() : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Task created");
        setTaskMessage("");
        setTaskDue("");
        setShowTaskForm(false);
      }
    } finally {
      setCreatingTask(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "conversation", label: "Chat" },
    { key: "activity", label: "Activity" },
    { key: "docs", label: `Docs${linkedDocs.length > 0 ? ` (${linkedDocs.length})` : ""}` },
  ];

  return (
    <SlideOver open={open} onClose={onClose} title={dealName || deal.deal_name}>
      <div className="space-y-4">
        {/* TG Chat button -- most prominent action */}
        {(deal.telegram_chat_link || tgLink) && (
          <a
            href={tgLink || deal.telegram_chat_link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-[#2AABEE] text-white px-4 py-2.5 text-sm font-medium transition hover:bg-[#2AABEE]/90 w-full"
          >
            <MessageCircle className="h-4 w-4" />
            Open Telegram Chat
          </a>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 pb-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {loadingContent && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        )}

        {/* Details tab */}
        {!loadingContent && tab === "details" && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Deal Name</label>
              <Input value={dealName} onChange={(e) => setDealName(e.target.value)} className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Board</label>
                <Select
                  value={boardType}
                  onChange={(e) => setBoardType(e.target.value)}
                  options={[
                    { value: "BD", label: "BD" },
                    { value: "Marketing", label: "Marketing" },
                    { value: "Admin", label: "Admin" },
                  ]}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Stage</label>
                <Select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  options={stages.map((s) => ({ value: s.id, label: s.name }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Value ($)</label>
                <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Probability (%)</label>
                <Input type="number" value={probability} onChange={(e) => setProbability(e.target.value)} placeholder="50" className="mt-1" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Telegram Chat Link</label>
              <Input value={tgLink} onChange={(e) => setTgLink(e.target.value)} placeholder="https://t.me/..." className="mt-1" />
            </div>

            {/* Custom fields */}
            {customFields
              .filter((f) => !f.board_type || f.board_type === boardType)
              .map((field) => (
                <div key={field.id}>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {field.label}{field.required && " *"}
                  </label>
                  {field.field_type === "select" ? (
                    <Select
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
                      placeholder={`Select ${field.label.toLowerCase()}`}
                      className="mt-1"
                    />
                  ) : field.field_type === "textarea" ? (
                    <textarea
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 min-h-[60px]"
                      placeholder={field.label}
                    />
                  ) : (
                    <Input
                      type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "url" ? "url" : "text"}
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      placeholder={field.label}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}

            {/* Outcome tracking */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Deal Outcome</label>
              <div className="flex gap-2 mt-1">
                {(["open", "won", "lost"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => handleOutcome(o)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors flex-1",
                      deal.outcome === o
                        ? o === "won" ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : o === "lost" ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : "bg-white/10 text-foreground border-white/20"
                        : "border-white/10 text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    {o === "open" ? "Open" : o === "won" ? "Won" : "Lost"}
                  </button>
                ))}
              </div>
              {deal.outcome === "lost" && (
                <Input
                  placeholder="Reason for loss..."
                  value={deal.outcome_reason ?? ""}
                  onChange={() => {}} // Read-only display for now
                  className="mt-1.5 text-xs"
                  disabled
                />
              )}
            </div>

            {/* Health score */}
            {deal.health_score != null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Deal Health</span>
                  <span className={cn(
                    "text-sm font-semibold",
                    deal.health_score >= 70 ? "text-green-400" : deal.health_score >= 40 ? "text-amber-400" : "text-red-400"
                  )}>
                    {deal.health_score}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      deal.health_score >= 70 ? "bg-green-400" : deal.health_score >= 40 ? "bg-amber-400" : "bg-red-400"
                    )}
                    style={{ width: `${deal.health_score}%` }}
                  />
                </div>
              </div>
            )}

            {/* AI Sentiment */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">AI Sentiment</span>
                <button
                  onClick={async () => {
                    if (!deal) return;
                    setSentimentLoading(true);
                    try {
                      const res = await fetch(`/api/deals/${deal.id}/sentiment`, { method: "POST" });
                      if (res.ok) {
                        const data = await res.json();
                        setSentiment(data.sentiment);
                        toast.success("Sentiment analyzed");
                      }
                    } finally {
                      setSentimentLoading(false);
                    }
                  }}
                  className="text-[10px] text-primary hover:underline"
                  disabled={sentimentLoading}
                >
                  {sentimentLoading ? "Analyzing..." : sentiment ? "Refresh" : "Analyze"}
                </button>
              </div>
              {sentiment ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                      sentiment.overall_sentiment === "positive" ? "bg-emerald-500/20 text-emerald-400" :
                      sentiment.overall_sentiment === "negative" ? "bg-red-500/20 text-red-400" :
                      sentiment.overall_sentiment === "mixed" ? "bg-amber-500/20 text-amber-400" :
                      "bg-white/10 text-muted-foreground"
                    )}>
                      {sentiment.overall_sentiment}
                    </span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                      sentiment.momentum === "accelerating" ? "bg-emerald-500/10 text-emerald-400" :
                      sentiment.momentum === "declining" ? "bg-red-500/10 text-red-400" :
                      "bg-white/5 text-muted-foreground"
                    )}>
                      {sentiment.momentum}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {sentiment.confidence}% confidence
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{sentiment.summary}</p>
                  {sentiment.tone_keywords.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {sentiment.tone_keywords.map((kw) => (
                        <span key={kw} className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] text-muted-foreground">{kw}</span>
                      ))}
                    </div>
                  )}
                  {sentiment.risk_signals.length > 0 && (
                    <div className="text-[9px] text-red-400">
                      Risks: {sentiment.risk_signals.join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground/50">Click Analyze to assess conversation sentiment.</p>
              )}
            </div>

            {/* AI Summary */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">AI Deal Summary</span>
                <button
                  onClick={async () => {
                    if (!deal) return;
                    setSummaryLoading(true);
                    try {
                      const res = await fetch(`/api/deals/${deal.id}/summary`, { method: "POST" });
                      if (res.ok) {
                        const data = await res.json();
                        setAiSummary(data.summary ?? null);
                        toast.success("Summary generated");
                      }
                    } finally {
                      setSummaryLoading(false);
                    }
                  }}
                  className="text-[10px] text-primary hover:underline"
                  disabled={summaryLoading}
                >
                  {summaryLoading ? "Generating..." : aiSummary ? "Refresh" : "Generate"}
                </button>
              </div>
              {aiSummary ? (
                <p className="text-[11px] text-foreground/80 leading-relaxed">{aiSummary}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground/50">Click Generate to create an AI summary of this deal.</p>
              )}
            </div>

            {/* Contact info (read-only for now) */}
            {deal.contact && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Contact</p>
                <p className="text-sm font-medium text-foreground">{deal.contact.name}</p>
                {deal.contact.company && <p className="text-xs text-muted-foreground">{deal.contact.company}</p>}
                {deal.contact.telegram_username && <p className="text-xs text-primary mt-0.5">@{deal.contact.telegram_username}</p>}
              </div>
            )}

            {/* Timestamps + stage duration */}
            <div className="space-y-1 pt-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">In current stage</span>
                <span className={cn(
                  "text-foreground",
                  deal.stage_changed_at && (Date.now() - new Date(deal.stage_changed_at).getTime()) > 14 * 86400000 && "text-amber-400"
                )}>
                  {deal.stage_changed_at ? `${Math.floor((Date.now() - new Date(deal.stage_changed_at).getTime()) / 86400000)}d` : "--"}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Stage changed</span>
                <span className="text-foreground">{deal.stage_changed_at ? timeAgo(deal.stage_changed_at) : "--"}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{timeAgo(deal.created_at)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Deal age</span>
                <span className="text-foreground">{Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000)}d</span>
              </div>
              {deal.outcome_at && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Closed</span>
                  <span className="text-foreground">{timeAgo(deal.outcome_at)}</span>
                </div>
              )}
            </div>

            {/* Quick task creation */}
            <div className="pt-2">
              {!showTaskForm ? (
                <button
                  onClick={() => setShowTaskForm(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add Task
                </button>
              ) : (
                <form onSubmit={handleCreateTask} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <Input
                    value={taskMessage}
                    onChange={(e) => setTaskMessage(e.target.value)}
                    placeholder="Task description..."
                    className="text-xs"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <input
                        type="datetime-local"
                        value={taskDue}
                        onChange={(e) => setTaskDue(e.target.value)}
                        className="bg-transparent border-none text-[10px] text-muted-foreground outline-none"
                      />
                    </div>
                    <div className="ml-auto flex gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowTaskForm(false)} className="h-6 px-2 text-[10px]">Cancel</Button>
                      <Button type="submit" size="sm" disabled={creatingTask || !taskMessage.trim()} className="h-6 px-2 text-[10px]">
                        {creatingTask ? "..." : "Add"}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Save + Delete */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {deleting ? "Deleting..." : "Delete"}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}

        {/* Chat tab */}
        {!loadingContent && tab === "conversation" && (
          <div className="space-y-4">
            {/* Conversation timeline */}
            <ConversationTimeline
              dealId={deal.id}
              telegramChatId={deal.telegram_chat_id ? Number(deal.telegram_chat_id) : null}
              telegramChatLink={deal.telegram_chat_link || tgLink || null}
            />

            {/* Notes section (collapsed) */}
            <details className="group">
              <summary className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                <StickyNote className="h-3 w-3" />
                Internal Notes ({notes.length})
              </summary>
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddNote()}
                  />
                  <Button size="sm" onClick={handleAddNote} disabled={sendingNote || !newNote.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground/50">{timeAgo(note.created_at)}</p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Activity tab */}
        {!loadingContent && tab === "activity" && (
          <div className="space-y-1">
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <GitBranch className="mx-auto h-6 w-6 text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="flex gap-2.5 py-2 border-b border-white/5 last:border-0">
                  <div className={cn(
                    "mt-0.5 shrink-0",
                    a.type === "tg_message" ? "text-blue-400" : a.type === "stage_change" ? "text-purple-400" : "text-muted-foreground"
                  )}>
                    {a.type === "tg_message" ? <MessageCircle className="h-3.5 w-3.5" /> :
                     a.type === "stage_change" ? <GitBranch className="h-3.5 w-3.5" /> :
                     <StickyNote className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">{a.title}</p>
                    {a.body && <p className="text-[10px] text-muted-foreground line-clamp-2">{a.body}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground/40">{timeAgo(a.created_at)}</span>
                      {a.tg_deep_link && (
                        <a href={a.tg_deep_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
                          <ExternalLink className="h-2.5 w-2.5" /> Open in TG
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Docs tab */}
        {!loadingContent && tab === "docs" && (
          <div className="space-y-3">
            {linkedDocs.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="mx-auto h-6 w-6 text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">No docs linked to this deal</p>
                <Link
                  href={`/docs`}
                  className="mt-2 inline-block text-xs text-primary hover:text-primary/80"
                >
                  Create a doc and link it
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {linkedDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/docs?edit=${doc.id}`}
                    className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-amber-400" />
                        <p className="text-sm font-medium text-foreground">{doc.title}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/40">{timeAgo(doc.updated_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SlideOver>
  );
}
