"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Radio, Send, ChevronDown, Loader2, CheckCircle, Users } from "lucide-react";
import { toast } from "sonner";

interface TgGroup {
  id: string;
  group_name: string;
  member_count: number;
  slugs?: string[];
}

export function BroadcastComposerPanel() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [slugs, setSlugs] = React.useState<string[]>([]);
  const [selectedSlug, setSelectedSlug] = React.useState<string>("");
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<string>>(new Set());
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [showGroups, setShowGroups] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // Fetch groups and slugs
  React.useEffect(() => {
    Promise.all([
      fetch("/api/groups").then((r) => r.json()),
      fetch("/api/groups/slugs").then((r) => r.json()),
    ])
      .then(([groupsRes, slugsRes]) => {
        setGroups(groupsRes.data ?? []);
        const slugList = (slugsRes.data ?? []).map((s: { slug: string }) => s.slug);
        setSlugs([...new Set(slugList)] as string[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // When slug changes, select matching groups
  React.useEffect(() => {
    if (!selectedSlug) {
      setSelectedGroupIds(new Set());
      return;
    }
    // Filter groups by slug (simplified — in production this would query the junction table)
    fetch(`/api/groups?slug=${encodeURIComponent(selectedSlug)}`)
      .then((r) => r.json())
      .then((json) => {
        const ids = (json.data ?? []).map((g: { id: string }) => g.id);
        setSelectedGroupIds(new Set(ids));
      })
      .catch(() => {});
  }, [selectedSlug]);

  function handleSendClick() {
    if (!message.trim() || selectedGroupIds.size === 0) {
      toast.error("Write a message and select groups");
      return;
    }
    setConfirming(true);
  }

  async function handleConfirmedSend() {
    setConfirming(false);
    setSending(true);
    try {
      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          group_ids: Array.from(selectedGroupIds),
          slug: selectedSlug || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error ?? "Broadcast failed");
        return;
      }

      setSent(true);
      toast("Broadcast sent!");
      setMessage("");

      setTimeout(() => setSent(false), 3000);
    } catch {
      toast.error("Failed to send broadcast");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Slug selector */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
            Target Groups
          </label>
          <div className="flex items-center gap-2">
            <select
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
              className="flex-1 rounded-lg px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-foreground focus:outline-none focus:border-primary/50 appearance-none"
            >
              <option value="">Select slug...</option>
              {slugs.map((slug) => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
            <button
              onClick={() => setShowGroups(!showGroups)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:bg-white/5 transition"
            >
              <Users className="h-3 w-3" />
              {selectedGroupIds.size}
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Group list (expandable) */}
      {showGroups && (
        <div className="rounded-lg border border-white/10 max-h-32 overflow-y-auto thin-scroll">
          {groups.map((group) => {
            const selected = selectedGroupIds.has(group.id);
            return (
              <button
                key={group.id}
                onClick={() => {
                  setSelectedGroupIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  });
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left transition",
                  selected ? "bg-primary/10" : "hover:bg-white/5"
                )}
              >
                <div className={cn(
                  "h-3 w-3 rounded border flex items-center justify-center shrink-0",
                  selected ? "bg-primary border-primary" : "border-white/20"
                )}>
                  {selected && <CheckCircle className="h-2 w-2 text-white" />}
                </div>
                <span className="text-xs text-foreground truncate flex-1">{group.group_name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{group.member_count} members</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Message composer */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your broadcast message... Supports {name}, {deal_name} merge variables"
          rows={4}
          className="w-full rounded-lg px-3 py-2 text-xs bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">
            {message.length} chars
          </span>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>Merge vars:</span>
            {["{name}", "{deal_name}"].map((v) => (
              <button
                key={v}
                onClick={() => setMessage((m) => m + v)}
                className="rounded bg-white/5 px-1 py-0.5 hover:bg-white/10 transition"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirming && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 space-y-2">
          <p className="text-xs text-yellow-300 font-medium">
            Send broadcast to {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""}?
          </p>
          <p className="text-[10px] text-muted-foreground line-clamp-2">{message.trim()}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirmedSend}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-3 w-3" />
              Confirm Send
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Send button */}
      {!confirming && (
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground">
            {selectedGroupIds.size > 0
              ? `Sending to ${selectedGroupIds.size} group${selectedGroupIds.size !== 1 ? "s" : ""}`
              : "No groups selected"}
          </div>
          <button
            onClick={handleSendClick}
            disabled={sending || !message.trim() || selectedGroupIds.size === 0}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition",
              sent
                ? "bg-green-500/20 text-green-400"
                : "bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : sent ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {sent ? "Sent!" : sending ? "Sending..." : "Send Broadcast"}
          </button>
        </div>
      )}
    </div>
  );
}
