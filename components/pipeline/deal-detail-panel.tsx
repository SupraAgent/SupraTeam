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
  MessageCircle, Save, Trash2, Send, GitBranch, StickyNote, ExternalLink, FileText,
} from "lucide-react";
import Link from "next/link";

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

  const TABS: { key: Tab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "conversation", label: "Notes" },
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

            {/* Contact info (read-only for now) */}
            {deal.contact && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Contact</p>
                <p className="text-sm font-medium text-foreground">{deal.contact.name}</p>
                {deal.contact.company && <p className="text-xs text-muted-foreground">{deal.contact.company}</p>}
                {deal.contact.telegram_username && <p className="text-xs text-primary mt-0.5">@{deal.contact.telegram_username}</p>}
              </div>
            )}

            {/* Timestamps */}
            <div className="space-y-1 pt-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Stage changed</span>
                <span className="text-foreground">{deal.stage_changed_at ? timeAgo(deal.stage_changed_at) : "--"}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{timeAgo(deal.created_at)}</span>
              </div>
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

        {/* Notes tab */}
        {!loadingContent && tab === "conversation" && (
          <div className="space-y-3">
            {/* Add note */}
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

            {/* Notes list */}
            {notes.length === 0 ? (
              <div className="text-center py-8">
                <StickyNote className="mx-auto h-6 w-6 text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">No notes yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground/50">{timeAgo(note.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
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
