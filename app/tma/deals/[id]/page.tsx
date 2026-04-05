"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { cn, timeAgo } from "@/lib/utils";
import { ArrowLeft, MessageCircle, Send, GitBranch, StickyNote, ExternalLink, Calendar, ChevronRight, Sparkles } from "lucide-react";
import { BookingLinkButton } from "@/components/calendly/booking-link-button";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { hapticNotification } from "@/components/tma/haptic";

type Deal = {
  id: string;
  deal_name: string;
  board_type: string;
  value: number | null;
  probability: number | null;
  telegram_chat_link: string | null;
  telegram_chat_id: number | null;
  health_score: number | null;
  ai_summary: string | null;
  outcome: string | null;
  stage_id: string | null;
  stage: { name: string; color: string } | null;
  contact: { id: string; name: string; company: string | null; telegram_username: string | null } | null;
};

type Stage = { id: string; name: string; position: number; color: string };
type Note = { id: string; text: string; created_at: string };
type Activity = { id: string; type: string; title: string; body?: string; tg_deep_link?: string; created_at: string };
type ChatMessage = {
  id: string;
  sender_name: string;
  text: string;
  sent_at: string;
  is_from_bot: boolean;
  source: "synced" | "notification";
};

export default function TMADealDetailPage() {
  const rawId = useParams().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const [deal, setDeal] = React.useState<Deal | null>(null);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [activities, setActivities] = React.useState<Activity[]>([]);
  const [tab, setTab] = React.useState<"info" | "notes" | "activity" | "chat">("info");
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [movingStage, setMovingStage] = React.useState(false);
  const [newNote, setNewNote] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatFetched, setChatFetched] = React.useState(false);
  const [chatReply, setChatReply] = React.useState("");
  const [chatSending, setChatSending] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const [tgSendStatus, setTgSendStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  const goBack = React.useCallback(() => router.back(), [router]);
  useTelegramWebApp({ onBack: goBack });

  React.useEffect(() => {
    async function safeFetch<T>(url: string, fallback: T): Promise<T> {
      try {
        const r = await fetch(url);
        if (!r.ok) return fallback;
        return await r.json();
      } catch {
        return fallback;
      }
    }

    Promise.all([
      safeFetch(`/api/deals/${id}`, { deal: null }),
      safeFetch(`/api/deals/${id}/notes`, { notes: [] }),
      safeFetch(`/api/deals/${id}/activity`, { activities: [] }),
      safeFetch("/api/pipeline", { stages: [] }),
    ]).then(([dealData, notesData, actData, stagesData]) => {
      setDeal(dealData.deal ?? null);
      setNotes(notesData.notes ?? []);
      setActivities(actData.activities ?? []);
      setStages(stagesData.stages ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  // Fetch chat messages when switching to chat tab
  React.useEffect(() => {
    if (tab !== "chat" || chatFetched || chatLoading) return;
    setChatLoading(true);
    fetch(`/api/deals/${id}/conversation?limit=30`)
      .then((r) => r.ok ? r.json() : { messages: [] })
      .then((data) => setChatMessages(data.messages ?? []))
      .catch(() => {})
      .finally(() => { setChatLoading(false); setChatFetched(true); });
  }, [tab, id, chatFetched, chatLoading]);

  // Auto-scroll to bottom when messages load
  React.useEffect(() => {
    if (tab === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, tab]);

  async function handleSendReply() {
    if (!chatReply.trim() || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch(`/api/deals/${id}/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatReply }),
      });
      if (res.ok) {
        setChatMessages((prev) => [...prev, {
          id: `temp-${Date.now()}`,
          sender_name: "You",
          text: chatReply,
          sent_at: new Date().toISOString(),
          is_from_bot: true,
          source: "synced",
        }]);
        setChatReply("");
      }
    } finally {
      setChatSending(false);
    }
  }

  async function handleMoveStage(stageId: string) {
    if (!deal || deal.stage_id === stageId) return;
    setMovingStage(true);
    try {
      const res = await fetch(`/api/deals/${id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId }),
      });
      if (res.ok) {
        const stage = stages.find((s) => s.id === stageId);
        setDeal((d) => d ? { ...d, stage_id: stageId, stage: stage ? { name: stage.name, color: stage.color } : d.stage } : d);
      }
    } finally {
      setMovingStage(false);
    }
  }

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

      {/* Quick actions: Booking Link + Send via TG + Ask AI */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        <BookingLinkButton dealId={id} contactId={deal.contact?.id} compact />
        {deal.telegram_chat_id && (
          <button
            onClick={async () => {
              setTgSendStatus("sending");
              try {
                // Generate a booking link first, then send via TG
                const linkRes = await fetch("/api/calendly/booking-link", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ deal_id: id, contact_id: deal.contact?.id }),
                });
                if (!linkRes.ok) { setTgSendStatus("error"); return; }
                const linkData = await linkRes.json();
                const url = linkData.data?.booking_url;
                if (!url) { setTgSendStatus("error"); return; }

                const contactName = deal.contact?.name?.split(" ")[0] ?? "there";
                const msg = `Hi ${contactName}, here is a link to schedule our call: ${url}`;
                const sendRes = await fetch("/api/inbox/reply", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: deal.telegram_chat_id, message: msg, send_as: "user" }),
                });
                if (sendRes.ok) {
                  setTgSendStatus("sent");
                  hapticNotification("success");
                  setTimeout(() => setTgSendStatus("idle"), 3000);
                } else {
                  setTgSendStatus("error");
                }
              } catch {
                setTgSendStatus("error");
              }
            }}
            disabled={tgSendStatus === "sending"}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition active:scale-95",
              tgSendStatus === "sent"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-blue-500/20 bg-blue-500/10 text-blue-400",
            )}
          >
            <Send className="h-3.5 w-3.5" />
            {tgSendStatus === "sending" ? "Sending..." : tgSendStatus === "sent" ? "Sent!" : "Send Calendly via TG"}
          </button>
        )}
        <button
          onClick={() => router.push(`/tma/ai-chat?deal_id=${id}`)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-400 transition active:bg-purple-500/20"
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask AI
        </button>
      </div>

      {/* Advance to next stage — 1-click shortcut */}
      {stages.length > 0 && deal.outcome === "open" && (() => {
        const sortedStages = [...stages].sort((a, b) => a.position - b.position);
        const currentIdx = sortedStages.findIndex((s) => s.id === deal.stage_id);
        const nextStage = currentIdx >= 0 && currentIdx < sortedStages.length - 1
          ? sortedStages[currentIdx + 1]
          : null;

        return nextStage ? (
          <div className="px-4 pb-2">
            <button
              onClick={() => handleMoveStage(nextStage.id)}
              disabled={movingStage}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition active:scale-[0.98]",
                movingStage && "opacity-50"
              )}
              style={{ backgroundColor: `${nextStage.color}20`, color: nextStage.color, border: `1px solid ${nextStage.color}30` }}
            >
              <ChevronRight className="h-4 w-4" />
              Advance to {nextStage.name}
            </button>
          </div>
        ) : null;
      })()}

      {/* Quick stage move */}
      {stages.length > 0 && deal.outcome === "open" && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-muted-foreground mb-1.5">Move to stage</p>
          <div className="flex gap-1 overflow-x-auto thin-scroll pb-1">
            {[...stages].sort((a, b) => a.position - b.position).map((s) => (
              <button
                key={s.id}
                onClick={() => handleMoveStage(s.id)}
                disabled={movingStage || deal.stage_id === s.id}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors whitespace-nowrap",
                  deal.stage_id === s.id
                    ? "border-2 text-foreground"
                    : "border border-white/10 text-muted-foreground active:bg-white/[0.06]",
                  movingStage && "opacity-50"
                )}
                style={deal.stage_id === s.id ? { borderColor: s.color, backgroundColor: `${s.color}20` } : undefined}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 px-4">
        {(["info", "chat", "notes", "activity"] as const).map((t) => (
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
          {/* Health score badge */}
          {deal.health_score != null && (
            <div className={cn(
              "rounded-xl p-3 flex items-center justify-between",
              deal.health_score >= 75 ? "bg-green-500/10 border border-green-500/20" :
              deal.health_score >= 50 ? "bg-yellow-500/10 border border-yellow-500/20" :
              deal.health_score >= 25 ? "bg-orange-500/10 border border-orange-500/20" :
              "bg-red-500/10 border border-red-500/20"
            )}>
              <span className="text-xs font-medium text-foreground">Health Score</span>
              <span className={cn(
                "text-lg font-bold",
                deal.health_score >= 75 ? "text-green-400" :
                deal.health_score >= 50 ? "text-yellow-400" :
                deal.health_score >= 25 ? "text-orange-400" :
                "text-red-400"
              )}>
                {deal.health_score}
              </span>
            </div>
          )}

          {/* AI Summary */}
          {deal.ai_summary && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
              <p className="text-[10px] text-purple-400 font-medium mb-1">AI Summary</p>
              <p className="text-xs text-foreground leading-relaxed">{deal.ai_summary}</p>
            </div>
          )}

          {/* Outcome buttons */}
          {deal.outcome === "open" && (
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (movingStage) return; // guard against double-tap
                  setMovingStage(true);
                  try {
                    await fetch(`/api/deals/${id}/outcome`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "won" }) });
                    setDeal((d) => d ? { ...d, outcome: "won" } : d);
                  } finally {
                    setMovingStage(false);
                  }
                }}
                disabled={movingStage}
                className={cn("flex-1 rounded-xl bg-green-500/10 border border-green-500/20 py-2 text-xs font-medium text-green-400 transition active:bg-green-500/20", movingStage && "opacity-50")}
              >
                Won
              </button>
              <button
                onClick={async () => {
                  if (movingStage) return;
                  setMovingStage(true);
                  try {
                    await fetch(`/api/deals/${id}/outcome`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "lost" }) });
                    setDeal((d) => d ? { ...d, outcome: "lost" } : d);
                  } finally {
                    setMovingStage(false);
                  }
                }}
                disabled={movingStage}
                className={cn("flex-1 rounded-xl bg-red-500/10 border border-red-500/20 py-2 text-xs font-medium text-red-400 transition active:bg-red-500/20", movingStage && "opacity-50")}
              >
                Lost
              </button>
            </div>
          )}
          {deal.outcome && deal.outcome !== "open" && (
            <div className={cn("rounded-xl p-3 text-center text-sm font-medium", deal.outcome === "won" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
              Deal {deal.outcome === "won" ? "Won" : "Lost"}
            </div>
          )}

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

      {/* Chat tab */}
      {tab === "chat" && (
        <div className="px-4 pt-3 flex flex-col" style={{ maxHeight: "calc(100vh - 260px)" }}>
          {chatLoading ? (
            <div className="space-y-2 py-4">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-white/[0.02] rounded-lg animate-pulse" />)}</div>
          ) : chatMessages.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/20" />
              <p className="mt-2 text-xs text-muted-foreground">No messages yet</p>
              {deal.telegram_chat_link && (
                <a href={deal.telegram_chat_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary mt-1 inline-block">
                  Open in Telegram
                </a>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1.5 pb-2 thin-scroll">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={cn("max-w-[85%] rounded-xl px-3 py-1.5", msg.is_from_bot || msg.sender_name === "You" ? "ml-auto bg-primary/15 text-foreground" : "bg-white/[0.06] text-foreground")}>
                  {!msg.is_from_bot && msg.sender_name !== "You" && (
                    <p className="text-[10px] font-medium text-primary/70">{msg.sender_name}</p>
                  )}
                  <p className="text-xs leading-relaxed">{msg.text}</p>
                  <p className="text-[9px] text-muted-foreground/40 text-right mt-0.5">{timeAgo(msg.sent_at)}</p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
          {/* Reply input */}
          <div className="flex gap-2 pt-2 pb-1 border-t border-white/10 mt-auto">
            <input
              value={chatReply}
              onChange={(e) => setChatReply(e.target.value)}
              placeholder="Reply via bot..."
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
            />
            <button
              onClick={handleSendReply}
              disabled={chatSending || !chatReply.trim()}
              className="rounded-xl bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
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
