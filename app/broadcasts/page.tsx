"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Tag, Users, Check, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TgGroup = {
  id: string;
  group_name: string;
  telegram_group_id: string;
  bot_is_admin: boolean;
  member_count: number | null;
  slugs: string[];
};

type BroadcastResult = {
  group_name: string;
  success: boolean;
  error?: string;
};

export default function BroadcastsPage() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<string>>(new Set());
  const [sending, setSending] = React.useState(false);
  const [results, setResults] = React.useState<BroadcastResult[] | null>(null);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/groups").then((r) => r.json()).catch(() => ({ groups: [] })),
      fetch("/api/groups/slugs").then((r) => r.json()).catch(() => ({ slugs: [] })),
    ]).then(([groupsData, slugsData]) => {
      const slugMap: Record<string, string[]> = {};
      for (const s of slugsData.slugs ?? []) {
        if (!slugMap[s.group_id]) slugMap[s.group_id] = [];
        slugMap[s.group_id].push(s.slug);
      }
      setGroups(
        (groupsData.groups ?? []).map((g: TgGroup) => ({ ...g, slugs: slugMap[g.id] ?? [] }))
      );
    }).finally(() => setLoading(false));
  }, []);

  const allSlugs = [...new Set(groups.flatMap((g) => g.slugs))].sort();

  const filteredGroups = selectedSlug
    ? groups.filter((g) => g.slugs.includes(selectedSlug))
    : groups;

  // When slug filter changes, auto-select all matching groups
  React.useEffect(() => {
    if (selectedSlug) {
      const matching = groups.filter((g) => g.slugs.includes(selectedSlug));
      setSelectedGroupIds(new Set(matching.map((g) => g.id)));
    } else {
      setSelectedGroupIds(new Set());
    }
  }, [selectedSlug, groups]);

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedGroupIds(new Set(filteredGroups.map((g) => g.id)));
  }

  function selectNone() {
    setSelectedGroupIds(new Set());
  }

  async function handleSend() {
    if (!message.trim() || selectedGroupIds.size === 0) return;
    setSending(true);
    setResults(null);
    try {
      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          group_ids: [...selectedGroupIds],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResults(data.results);
        toast.success(`Sent to ${data.sent}/${data.total} groups`);
        if (data.sent === data.total) {
          setMessage("");
        }
      } else {
        toast.error(data.error ?? "Failed to send");
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Broadcasts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send messages to Telegram groups. Filter by slug for targeted broadcasts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Compose */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              Compose Message
            </h2>

            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your broadcast message... (HTML supported: <b>bold</b>, <i>italic</i>, <a href='url'>link</a>)"
              className="min-h-[160px]"
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""} selected
              </p>
              <Button
                onClick={handleSend}
                disabled={sending || !message.trim() || selectedGroupIds.size === 0}
              >
                <Send className="mr-1 h-3.5 w-3.5" />
                {sending ? "Sending..." : `Send to ${selectedGroupIds.size} group${selectedGroupIds.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>

          {/* Results */}
          {results && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-2">
              <h2 className="text-sm font-medium text-foreground">Delivery Results</h2>
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-xs text-foreground">{r.group_name}</span>
                  {r.success ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <Check className="h-3 w-3" /> Sent
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-400" title={r.error}>
                      <X className="h-3 w-3" /> Failed
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Group selection */}
        <div className="space-y-4">
          {/* Slug filter */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Tag className="h-4 w-4 text-purple-400" />
              Filter by Slug
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedSlug(null)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  !selectedSlug ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
                )}
              >
                All
              </button>
              {allSlugs.map((slug) => (
                <button
                  key={slug}
                  onClick={() => setSelectedSlug(selectedSlug === slug ? null : slug)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedSlug === slug ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  {slug} ({groups.filter((g) => g.slugs.includes(slug)).length})
                </button>
              ))}
              {allSlugs.length === 0 && (
                <p className="text-xs text-muted-foreground">No slugs defined. Add slugs to groups first.</p>
              )}
            </div>
          </div>

          {/* Group list */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                Groups ({filteredGroups.length})
              </h2>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-primary hover:underline">Select all</button>
                <button onClick={selectNone} className="text-xs text-muted-foreground hover:underline">None</button>
              </div>
            </div>

            <div className="space-y-1 max-h-[400px] overflow-y-auto thin-scroll">
              {filteredGroups.map((group) => (
                <label
                  key={group.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition",
                    selectedGroupIds.has(group.id) ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.has(group.id)}
                    onChange={() => toggleGroup(group.id)}
                    className="rounded border-white/20"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{group.group_name}</p>
                    <div className="flex items-center gap-1.5">
                      {group.slugs.map((s) => (
                        <span key={s} className="text-[9px] text-primary bg-primary/10 rounded px-1 py-0.5">{s}</span>
                      ))}
                      {group.member_count != null && (
                        <span className="text-[9px] text-muted-foreground">{group.member_count} members</span>
                      )}
                    </div>
                  </div>
                  {!group.bot_is_admin && (
                    <span className="text-[9px] text-red-400">Not admin</span>
                  )}
                </label>
              ))}

              {filteredGroups.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No groups available. Connect groups in Telegram Settings first.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
