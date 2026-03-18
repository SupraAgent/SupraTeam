"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ArrowLeft, MessageCircle, Send, GitBranch, StickyNote, ExternalLink } from "lucide-react";

type Deal = {
  id: string;
  deal_name: string;
  board_type: string;
  value: number | null;
  probability: number | null;
  telegram_chat_link: string | null;
  stage: { name: string; color: string } | null;
  contact: { name: string; company: string | null; telegram_username: string | null } | null;
};

type Note = { id: string; text: string; created_at: string };
type Activity = { id: string; type: string; title: string; body?: string; tg_deep_link?: string; created_at: string };

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function TMADealDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [deal, setDeal] = React.useState<Deal | null>(null);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [activities, setActivities] = React.useState<Activity[]>([]);
  const [tab, setTab] = React.useState<"info" | "notes" | "activity">("info");
  const [newNote, setNewNote] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Telegram) {
      const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void } } }).Telegram.WebApp;
      tg.ready();
      tg.expand();
    }

    Promise.all([
      fetch(`/api/deals/${id}`).then((r) => r.json()),
      fetch(`/api/deals/${id}/notes`).then((r) => r.json()),
      fetch(`/api/deals/${id}/activity`).then((r) => r.json()),
    ]).then(([dealData, notesData, actData]) => {
      setDeal(dealData.deal ?? null);
      setNotes(notesData.notes ?? []);
      setActivities(actData.activities ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/deals/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newNote }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => [data.note, ...prev]);
        setNewNote("");
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-white/[0.02] rounded-xl animate-pulse" />)}</div>;
  }

  if (!deal) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Deal not found</div>;
  }

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-foreground truncate">{deal.deal_name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {deal.stage && (
              <span className="text-[10px] flex items-center gap-1" style={{ color: deal.stage.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                {deal.stage.name}
              </span>
            )}
            <span className={cn("text-[10px]", deal.board_type === "BD" ? "text-blue-400" : deal.board_type === "Marketing" ? "text-purple-400" : "text-orange-400")}>
              {deal.board_type}
            </span>
            {deal.value != null && deal.value > 0 && (
              <span className="text-[10px] text-muted-foreground">${Number(deal.value).toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* TG Chat button */}
      {deal.telegram_chat_link && (
        <div className="px-4 pb-3">
          <a
            href={deal.telegram_chat_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-[#2AABEE] text-white px-4 py-2.5 text-sm font-medium w-full"
          >
            <MessageCircle className="h-4 w-4" />
            Open Telegram Chat
          </a>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 px-4">
        {(["info", "notes", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px capitalize transition-colors",
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {tab === "info" && (
        <div className="px-4 pt-3 space-y-3">
          {deal.contact && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] text-muted-foreground">Contact</p>
              <p className="text-sm text-foreground">{deal.contact.name}</p>
              {deal.contact.company && <p className="text-xs text-muted-foreground">{deal.contact.company}</p>}
              {deal.contact.telegram_username && (
                <a href={`https://t.me/${deal.contact.telegram_username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary mt-0.5 block">
                  @{deal.contact.telegram_username}
                </a>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Row label="Value" value={deal.value != null ? `$${Number(deal.value).toLocaleString()}` : "--"} />
            <Row label="Probability" value={deal.probability != null ? `${deal.probability}%` : "--"} />
            <Row label="Board" value={deal.board_type} />
          </div>
        </div>
      )}

      {/* Notes tab */}
      {tab === "notes" && (
        <div className="px-4 pt-3 space-y-3">
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
            />
            <button
              onClick={handleAddNote}
              disabled={sending || !newNote.trim()}
              className="rounded-xl bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-center py-6 text-xs text-muted-foreground">No notes yet</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap">{n.text}</p>
                <p className="mt-1 text-[10px] text-muted-foreground/50">{timeAgo(n.created_at)}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Activity tab */}
      {tab === "activity" && (
        <div className="px-4 pt-3 space-y-1">
          {activities.length === 0 ? (
            <p className="text-center py-6 text-xs text-muted-foreground">No activity yet</p>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="flex gap-2 py-2 border-b border-white/5 last:border-0">
                <div className={cn("mt-0.5 shrink-0", a.type === "tg_message" ? "text-blue-400" : a.type === "stage_change" ? "text-purple-400" : "text-muted-foreground")}>
                  {a.type === "tg_message" ? <MessageCircle className="h-3.5 w-3.5" /> : a.type === "stage_change" ? <GitBranch className="h-3.5 w-3.5" /> : <StickyNote className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{a.title}</p>
                  {a.body && <p className="text-[10px] text-muted-foreground line-clamp-2">{a.body}</p>}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-muted-foreground/40">{timeAgo(a.created_at)}</span>
                    {a.tg_deep_link && (
                      <a href={a.tg_deep_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 flex items-center gap-0.5">
                        <ExternalLink className="h-2.5 w-2.5" /> TG
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
