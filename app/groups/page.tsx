"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  Users,
  Shield,
  ShieldOff,
  Tag,
  X,
  Plus,
  Check,
  Archive,
  ArchiveRestore,
  Activity,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";

type HealthStatus = "active" | "quiet" | "stale" | "dead" | "unknown";

type TgGroup = {
  id: string;
  telegram_group_id: string;
  group_name: string;
  group_type: string | null;
  group_url: string | null;
  bot_is_admin: boolean;
  member_count: number | null;
  is_archived: boolean;
  archived_at: string | null;
  last_message_at: string | null;
  message_count_7d: number;
  message_count_30d: number;
  health_status: HealthStatus;
  last_bot_check_at: string | null;
  created_at: string;
  updated_at: string;
  slugs: string[];
};

type SortKey = "name" | "last_active" | "members" | "health";

const HEALTH_CONFIG: Record<
  HealthStatus,
  { color: string; bg: string; border: string; label: string; dot: string }
> = {
  active: {
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    label: "Active",
    dot: "bg-emerald-400",
  },
  quiet: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    label: "Quiet",
    dot: "bg-yellow-400",
  },
  stale: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    label: "Stale",
    dot: "bg-orange-400",
  },
  dead: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "Dead",
    dot: "bg-red-400",
  },
  unknown: {
    color: "text-muted-foreground",
    bg: "bg-white/5",
    border: "border-white/10",
    label: "Unknown",
    dot: "bg-gray-500",
  },
};

const HEALTH_ORDER: Record<HealthStatus, number> = {
  active: 0,
  quiet: 1,
  stale: 2,
  dead: 3,
  unknown: 4,
};

export default function GroupsPage() {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [slugFilter, setSlugFilter] = React.useState<string | null>(null);
  const [healthFilter, setHealthFilter] = React.useState<HealthStatus | null>(null);
  const [adminFilter, setAdminFilter] = React.useState<boolean | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortKey>("name");
  const [addingSlug, setAddingSlug] = React.useState<string | null>(null);
  const [newSlug, setNewSlug] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkSlugInput, setBulkSlugInput] = React.useState("");
  const [bulkAction, setBulkAction] = React.useState<string | null>(null);
  const [refreshingStats, setRefreshingStats] = React.useState(false);

  const fetchGroups = React.useCallback(async () => {
    try {
      const [groupsRes, slugsRes] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/groups/slugs"),
      ]);
      if (groupsRes.ok) {
        const data = await groupsRes.json();
        const rawGroups = data.groups ?? [];
        const slugsData = slugsRes.ok ? await slugsRes.json() : { slugs: [] };
        const slugMap: Record<string, string[]> = {};
        for (const s of slugsData.slugs ?? []) {
          if (!slugMap[s.group_id]) slugMap[s.group_id] = [];
          slugMap[s.group_id].push(s.slug);
        }
        setGroups(
          rawGroups.map((g: TgGroup) => ({
            ...g,
            slugs: slugMap[g.id] ?? [],
            is_archived: g.is_archived ?? false,
            message_count_7d: g.message_count_7d ?? 0,
            message_count_30d: g.message_count_30d ?? 0,
            health_status: g.health_status ?? "unknown",
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  async function refreshStats() {
    setRefreshingStats(true);
    try {
      await fetch("/api/groups/stats");
      await fetchGroups();
      showMsg("Stats refreshed");
    } finally {
      setRefreshingStats(false);
    }
  }

  function showMsg(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2000);
  }

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
          g.id === groupId
            ? { ...g, slugs: [...g.slugs, newSlug.trim().toLowerCase()] }
            : g
        )
      );
      setNewSlug("");
      setAddingSlug(null);
      showMsg("Slug added");
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

  async function handleBulkAction(action: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const body: Record<string, unknown> = { action, group_ids: ids };
    if ((action === "assign_slug" || action === "remove_slug") && bulkSlugInput.trim()) {
      body.slug = bulkSlugInput.trim().toLowerCase();
    }

    const res = await fetch("/api/groups/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      showMsg(`${action}: ${data.affected}/${data.total} groups`);
      setSelected(new Set());
      setBulkSlugInput("");
      setBulkAction(null);
      setLoading(true);
      fetchGroups();
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredActive.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredActive.map((g) => g.id)));
    }
  }

  // All unique slugs
  const allSlugs = [...new Set(groups.flatMap((g) => g.slugs))].sort();

  // Filter & sort
  const activeGroups = groups.filter((g) => !g.is_archived);
  const archivedGroups = groups.filter((g) => g.is_archived);

  const filterFn = (g: TgGroup) => {
    if (slugFilter && !g.slugs.includes(slugFilter)) return false;
    if (healthFilter && g.health_status !== healthFilter) return false;
    if (adminFilter !== null && g.bot_is_admin !== adminFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        g.group_name.toLowerCase().includes(q) || g.slugs.some((s) => s.includes(q))
      );
    }
    return true;
  };

  const sortFn = (a: TgGroup, b: TgGroup) => {
    switch (sortBy) {
      case "last_active":
        return (
          new Date(b.last_message_at ?? 0).getTime() -
          new Date(a.last_message_at ?? 0).getTime()
        );
      case "members":
        return (b.member_count ?? 0) - (a.member_count ?? 0);
      case "health":
        return HEALTH_ORDER[a.health_status] - HEALTH_ORDER[b.health_status];
      default:
        return a.group_name.localeCompare(b.group_name);
    }
  };

  const filteredActive = activeGroups.filter(filterFn).sort(sortFn);
  const filteredArchived = archivedGroups.filter(filterFn).sort(sortFn);

  // Stats
  const activeCount = activeGroups.filter(
    (g) => g.health_status === "active"
  ).length;
  const staleDeadCount = activeGroups.filter(
    (g) => g.health_status === "stale" || g.health_status === "dead"
  ).length;

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Telegram Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeGroups.length} group{activeGroups.length !== 1 ? "s" : ""} connected
            {archivedGroups.length > 0 && `, ${archivedGroups.length} archived`}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-primary">{msg}</span>}
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshStats}
            disabled={refreshingStats}
          >
            <Activity
              className={cn("mr-1 h-3.5 w-3.5", refreshingStats && "animate-spin")}
            />
            Refresh Stats
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLoading(true);
              fetchGroups();
            }}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{activeGroups.length}</p>
          <p className="text-xs text-muted-foreground">Total Groups</p>
        </div>
        <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-emerald-400">
            {activeGroups.filter((g) => g.bot_is_admin).length}
          </p>
          <p className="text-xs text-muted-foreground">Bot is Admin</p>
        </div>
        <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-blue-400">{allSlugs.length}</p>
          <p className="text-xs text-muted-foreground">Unique Slugs</p>
        </div>
        <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-emerald-400">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Active Groups</p>
        </div>
        {staleDeadCount > 0 ? (
          <div className="rounded-xl border border-orange-500/10 bg-orange-500/5 p-3 text-center">
            <p className="text-lg font-semibold text-orange-400">{staleDeadCount}</p>
            <p className="text-xs text-muted-foreground">Stale / Dead</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <p className="text-lg font-semibold text-foreground">0</p>
            <p className="text-xs text-muted-foreground">Stale / Dead</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups..."
          className="max-w-[200px] h-8 text-xs"
        />

        {/* Slug filter pills */}
        <button
          onClick={() => setSlugFilter(null)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            !slugFilter
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:bg-white/5"
          )}
        >
          All ({activeGroups.length})
        </button>
        {allSlugs.map((slug) => (
          <button
            key={slug}
            onClick={() => setSlugFilter(slugFilter === slug ? null : slug)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
              slugFilter === slug
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-white/5"
            )}
          >
            <Tag className="h-3 w-3" />
            {slug} ({activeGroups.filter((g) => g.slugs.includes(slug)).length})
          </button>
        ))}

        <div className="h-4 w-px bg-white/10 mx-1" />

        {/* Health filter */}
        <div className="relative">
          <button
            onClick={() =>
              setHealthFilter(healthFilter ? null : "active")
            }
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
              healthFilter
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:bg-white/5"
            )}
          >
            Health
            <ChevronDown className="h-3 w-3" />
          </button>
          {healthFilter && (
            <div className="absolute top-full left-0 mt-1 z-10 rounded-lg border border-white/10 bg-[#1a1a2e] p-1 shadow-xl min-w-[120px]">
              {(["active", "quiet", "stale", "dead", "unknown"] as HealthStatus[]).map(
                (h) => (
                  <button
                    key={h}
                    onClick={() =>
                      setHealthFilter(healthFilter === h ? null : h)
                    }
                    className={cn(
                      "flex items-center gap-2 w-full rounded px-2.5 py-1.5 text-xs transition-colors",
                      healthFilter === h
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-full", HEALTH_CONFIG[h].dot)}
                    />
                    {HEALTH_CONFIG[h].label}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Admin filter */}
        <button
          onClick={() =>
            setAdminFilter(
              adminFilter === null ? true : adminFilter === true ? false : null
            )
          }
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1",
            adminFilter !== null
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:bg-white/5"
          )}
        >
          {adminFilter === null
            ? "Admin: All"
            : adminFilter
              ? "Admin Only"
              : "Members Only"}
        </button>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs text-muted-foreground"
        >
          <option value="name">Sort: Name</option>
          <option value="last_active">Sort: Last Active</option>
          <option value="members">Sort: Members</option>
          <option value="health">Sort: Health</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
          <span className="text-xs font-medium text-primary">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-primary/20" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setBulkAction(bulkAction === "assign_slug" ? null : "assign_slug")}
          >
            <Tag className="mr-1 h-3 w-3" />
            Assign Slug
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setBulkAction(bulkAction === "remove_slug" ? null : "remove_slug")}
          >
            <X className="mr-1 h-3 w-3" />
            Remove Slug
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => handleBulkAction("archive")}
          >
            <Archive className="mr-1 h-3 w-3" />
            Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => handleBulkAction("refresh_status")}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Verify Status
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              setSelected(new Set());
              setBulkAction(null);
            }}
          >
            Clear
          </Button>

          {(bulkAction === "assign_slug" || bulkAction === "remove_slug") && (
            <div className="flex items-center gap-1 ml-2">
              <Input
                value={bulkSlugInput}
                onChange={(e) => setBulkSlugInput(e.target.value)}
                placeholder="slug-name"
                className="h-7 w-28 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && bulkSlugInput.trim()) {
                    handleBulkAction(bulkAction);
                  }
                  if (e.key === "Escape") setBulkAction(null);
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => handleBulkAction(bulkAction)}
                disabled={!bulkSlugInput.trim()}
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Group list */}
      <div className="space-y-2">
        {/* Select all */}
        {filteredActive.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-1">
            <button
              onClick={toggleSelectAll}
              className={cn(
                "h-4 w-4 rounded border transition-colors flex items-center justify-center",
                selected.size === filteredActive.length
                  ? "bg-primary border-primary"
                  : "border-white/20 hover:border-white/40"
              )}
            >
              {selected.size === filteredActive.length && (
                <Check className="h-3 w-3 text-white" />
              )}
            </button>
            <span className="text-[10px] text-muted-foreground">
              Select all ({filteredActive.length})
            </span>
          </div>
        )}

        {filteredActive.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            isSelected={selected.has(group.id)}
            onToggleSelect={() => toggleSelect(group.id)}
            addingSlug={addingSlug}
            setAddingSlug={setAddingSlug}
            newSlug={newSlug}
            setNewSlug={setNewSlug}
            onAddSlug={handleAddSlug}
            onRemoveSlug={handleRemoveSlug}
          />
        ))}

        {filteredActive.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              {activeGroups.length === 0
                ? "No groups connected. Add the Telegram bot to your groups as an admin."
                : "No groups match your filter."}
            </p>
          </div>
        )}
      </div>

      {/* Archived groups */}
      {archivedGroups.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Archive className="h-3 w-3" />
            {showArchived ? "Hide" : "Show"} archived ({archivedGroups.length})
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                showArchived && "rotate-180"
              )}
            />
          </button>

          {showArchived && (
            <div className="space-y-2 opacity-60">
              {filteredArchived.map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Archive className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground truncate">
                        {group.group_name}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        Archived {group.archived_at ? timeAgo(group.archived_at as string) : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={async () => {
                        await fetch("/api/groups/bulk", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "unarchive",
                            group_ids: [group.id],
                          }),
                        });
                        setLoading(true);
                        fetchGroups();
                      }}
                    >
                      <ArchiveRestore className="mr-1 h-3 w-3" />
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  group,
  isSelected,
  onToggleSelect,
  addingSlug,
  setAddingSlug,
  newSlug,
  setNewSlug,
  onAddSlug,
  onRemoveSlug,
}: {
  group: TgGroup;
  isSelected: boolean;
  onToggleSelect: () => void;
  addingSlug: string | null;
  setAddingSlug: (id: string | null) => void;
  newSlug: string;
  setNewSlug: (v: string) => void;
  onAddSlug: (groupId: string) => void;
  onRemoveSlug: (groupId: string, slug: string) => void;
}) {
  const health = HEALTH_CONFIG[group.health_status];

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.035] px-4 py-3 space-y-2 transition-colors",
        isSelected ? "border-primary/30 bg-primary/5" : "border-white/10"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          className={cn(
            "h-4 w-4 rounded border transition-colors flex items-center justify-center shrink-0",
            isSelected
              ? "bg-primary border-primary"
              : "border-white/20 hover:border-white/40"
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-white" />}
        </button>

        {/* Icon */}
        <div className="h-9 w-9 rounded-lg bg-[#229ED9]/20 flex items-center justify-center shrink-0">
          <Users className="h-4 w-4 text-[#229ED9]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">
              {group.group_name}
            </p>
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
            <span className="font-mono text-[10px]">
              ID: {group.telegram_group_id}
            </span>
          </div>
        </div>

        {/* Health badge */}
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
            health.bg,
            health.border,
            health.color
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", health.dot)} />
          {health.label}
        </span>

        {/* Admin badge */}
        {group.bot_is_admin ? (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
            <Shield className="h-3 w-3" /> Admin
            {group.last_bot_check_at && (
              <span className="text-[9px] text-emerald-400/50 ml-0.5">
                {timeAgo(group.last_bot_check_at)}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
            <ShieldOff className="h-3 w-3" /> Member
          </span>
        )}
      </div>

      {/* Activity metrics */}
      {(group.last_message_at || group.message_count_7d > 0 || group.message_count_30d > 0) && (
        <div className="flex items-center gap-3 pl-[4.5rem] text-[10px] text-muted-foreground">
          {group.last_message_at && (
            <span>Last message: {timeAgo(group.last_message_at)}</span>
          )}
          {group.message_count_7d > 0 && (
            <span>{group.message_count_7d} msgs this week</span>
          )}
          {group.message_count_30d > 0 && (
            <span>{group.message_count_30d} msgs this month</span>
          )}
        </div>
      )}

      {/* Stale warning */}
      {(group.health_status === "stale" || group.health_status === "dead") && (
        <div className="flex items-center gap-1.5 pl-[4.5rem] text-[10px] text-orange-400">
          <AlertTriangle className="h-3 w-3" />
          {group.health_status === "dead"
            ? "No activity in 30+ days. Consider archiving."
            : "Low activity. Check if bot is still in this group."}
        </div>
      )}

      {/* Slugs */}
      <div className="flex items-center gap-1.5 flex-wrap pl-[4.5rem]">
        {group.slugs.map((slug) => (
          <span
            key={slug}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary"
          >
            <Tag className="h-2.5 w-2.5" />
            {slug}
            <button
              onClick={() => onRemoveSlug(group.id, slug)}
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
                if (e.key === "Enter") onAddSlug(group.id);
                if (e.key === "Escape") {
                  setAddingSlug(null);
                  setNewSlug("");
                }
              }}
            />
            <button
              onClick={() => onAddSlug(group.id)}
              className="text-primary hover:text-primary/80"
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                setAddingSlug(null);
                setNewSlug("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
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
  );
}
