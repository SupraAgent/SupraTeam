"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Users, Shield, ShieldOff, Tag, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type TgGroup = {
  id: string;
  telegram_group_id: string;
  group_name: string;
  group_type: string | null;
  group_url: string | null;
  bot_is_admin: boolean;
  member_count: number | null;
  created_at: string;
  updated_at: string;
  slugs: string[];
};

export default function GroupsPage() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [slugFilter, setSlugFilter] = React.useState<string | null>(null);
  const [addingSlug, setAddingSlug] = React.useState<string | null>(null); // group id
  const [newSlug, setNewSlug] = React.useState("");
  const [msg, setMsg] = React.useState("");

  const fetchGroups = React.useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        const groups = data.groups ?? [];

        // Fetch slugs for all groups
        const slugsRes = await fetch("/api/groups/slugs");
        const slugsData = slugsRes.ok ? await slugsRes.json() : { slugs: [] };
        const slugMap: Record<string, string[]> = {};
        for (const s of slugsData.slugs ?? []) {
          if (!slugMap[s.group_id]) slugMap[s.group_id] = [];
          slugMap[s.group_id].push(s.slug);
        }

        setGroups(groups.map((g: TgGroup) => ({ ...g, slugs: slugMap[g.id] ?? [] })));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function handleAddSlug(groupId: string) {
    if (!newSlug.trim()) return;
    const res = await fetch("/api/groups/slugs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, slug: newSlug.trim().toLowerCase() }),
    });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, slugs: [...g.slugs, newSlug.trim().toLowerCase()] } : g
        )
      );
      setNewSlug("");
      setAddingSlug(null);
      setMsg("Slug added");
      setTimeout(() => setMsg(""), 2000);
    }
  }

  async function handleRemoveSlug(groupId: string, slug: string) {
    const res = await fetch("/api/groups/slugs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, slug }),
    });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, slugs: g.slugs.filter((s) => s !== slug) } : g
        )
      );
    }
  }

  // All unique slugs for filter
  const allSlugs = [...new Set(groups.flatMap((g) => g.slugs))].sort();

  const filtered = groups.filter((g) => {
    if (slugFilter && !g.slugs.includes(slugFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return g.group_name.toLowerCase().includes(q) || g.slugs.some((s) => s.includes(q));
    }
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Telegram Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {groups.length} group{groups.length !== 1 ? "s" : ""} connected. Tag with slugs for bulk access control.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-primary">{msg}</span>}
          <Button size="sm" variant="ghost" onClick={() => { setLoading(true); fetchGroups(); }}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups..."
          className="max-w-[200px] h-8 text-xs"
        />
        <button
          onClick={() => setSlugFilter(null)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            !slugFilter ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
          )}
        >
          All ({groups.length})
        </button>
        {allSlugs.map((slug) => (
          <button
            key={slug}
            onClick={() => setSlugFilter(slugFilter === slug ? null : slug)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
              slugFilter === slug ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5"
            )}
          >
            <Tag className="h-3 w-3" />
            {slug} ({groups.filter((g) => g.slugs.includes(slug)).length})
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{groups.length}</p>
          <p className="text-xs text-muted-foreground">Total Groups</p>
        </div>
        <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-emerald-400">
            {groups.filter((g) => g.bot_is_admin).length}
          </p>
          <p className="text-xs text-muted-foreground">Bot is Admin</p>
        </div>
        <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-blue-400">{allSlugs.length}</p>
          <p className="text-xs text-muted-foreground">Unique Slugs</p>
        </div>
      </div>

      {/* Group list */}
      <div className="space-y-2">
        {filtered.map((group) => (
          <div
            key={group.id}
            className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 space-y-2"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[#229ED9]/20 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-[#229ED9]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{group.group_name}</p>
                  {group.group_url && (
                    <a
                      href={group.group_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Open
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{group.group_type ?? "group"}</span>
                  {group.member_count != null && <span>{group.member_count} members</span>}
                  <span className="font-mono text-[10px]">ID: {group.telegram_group_id}</span>
                </div>
              </div>
              {group.bot_is_admin ? (
                <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
                  <Shield className="h-3 w-3" /> Admin
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                  <ShieldOff className="h-3 w-3" /> Member
                </span>
              )}
            </div>

            {/* Slugs */}
            <div className="flex items-center gap-1.5 flex-wrap pl-12">
              {group.slugs.map((slug) => (
                <span
                  key={slug}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {slug}
                  <button
                    onClick={() => handleRemoveSlug(group.id, slug)}
                    className="hover:text-red-400 transition ml-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}

              {addingSlug === group.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="slug-name"
                    className="h-6 w-24 text-[10px] px-2"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSlug(group.id);
                      if (e.key === "Escape") { setAddingSlug(null); setNewSlug(""); }
                    }}
                  />
                  <button onClick={() => handleAddSlug(group.id)} className="text-primary hover:text-primary/80">
                    <Plus className="h-3 w-3" />
                  </button>
                  <button onClick={() => { setAddingSlug(null); setNewSlug(""); }} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingSlug(group.id)}
                  className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-white/20 transition"
                >
                  <Plus className="h-2.5 w-2.5" />
                  Add slug
                </button>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              {groups.length === 0
                ? "No groups connected. Add the Telegram bot to your groups as an admin."
                : "No groups match your filter."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
