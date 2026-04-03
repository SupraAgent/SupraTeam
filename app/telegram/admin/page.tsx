"use client";

import * as React from "react";
import { useTelegram } from "@/lib/client/telegram-context";
import { useTelegramAdminGroups } from "@/lib/client/use-telegram-admin-groups";
import { AdminGroupDetailPanel } from "@/components/telegram/admin-group-detail-panel";
import type { TgAdminGroup } from "@/lib/client/telegram-service";
import {
  Search,
  RefreshCw,
  Loader2,
  Shield,
  Crown,
  Users,
  MessageCircle,
  Link as LinkIcon,
} from "lucide-react";

export default function TelegramAdminPage() {
  const { status } = useTelegram();
  const { groups, loading, error, refresh } = useTelegramAdminGroups();
  const [search, setSearch] = React.useState("");
  const [selectedGroup, setSelectedGroup] = React.useState<TgAdminGroup | null>(null);

  const filtered = React.useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.username?.toLowerCase().includes(q)
    );
  }, [groups, search]);

  const supergroups = filtered.filter((g) => g.type === "supergroup");
  const legacyGroups = filtered.filter((g) => g.type === "group");

  if (status !== "connected") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">My Admin Groups</h2>
          <p className="text-sm text-muted-foreground">
            Connect your Telegram account to see all groups where you&apos;re an admin.
          </p>
          <a
            href="/telegram"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2AABEE] text-white text-sm font-medium hover:bg-[#2AABEE]/90 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Connect Telegram
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Admin Groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? "Scanning your Telegram groups..."
              : `${groups.length} group${groups.length !== 1 ? "s" : ""} where you're admin`}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups..."
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && groups.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      )}

      {/* Stats bar */}
      {!loading && groups.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-lg font-semibold text-foreground">{groups.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Creator</p>
            <p className="text-lg font-semibold text-amber-400">
              {groups.filter((g) => g.isCreator).length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin</p>
            <p className="text-lg font-semibold text-blue-400">
              {groups.filter((g) => !g.isCreator).length}
            </p>
          </div>
        </div>
      )}

      {/* Group list */}
      {filtered.length > 0 && (
        <div className="space-y-4">
          {/* Supergroups */}
          {supergroups.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
                Supergroups ({supergroups.length})
              </h3>
              {supergroups.map((g) => (
                <GroupCard key={g.telegramId} group={g} onClick={() => setSelectedGroup(g)} />
              ))}
            </div>
          )}

          {/* Legacy groups */}
          {legacyGroups.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
                Groups ({legacyGroups.length})
              </h3>
              {legacyGroups.map((g) => (
                <GroupCard key={g.telegramId} group={g} onClick={() => setSelectedGroup(g)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && groups.length === 0 && !error && (
        <div className="text-center py-12">
          <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No admin groups found.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            You need to be an admin or creator of Telegram groups to see them here.
          </p>
        </div>
      )}

      {/* Detail panel */}
      <AdminGroupDetailPanel
        group={selectedGroup}
        open={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
      />
    </div>
  );
}

function GroupCard({ group, onClick }: { group: TgAdminGroup; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
    >
      <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
        <Users className="h-4 w-4 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{group.title}</p>
          {group.isCreator ? (
            <Crown className="h-3 w-3 text-amber-400 shrink-0" />
          ) : (
            <Shield className="h-3 w-3 text-blue-400 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{group.type === "supergroup" ? "Supergroup" : "Group"}</span>
          {group.memberCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Users className="h-2.5 w-2.5" /> {group.memberCount}
            </span>
          )}
          {group.username && (
            <span className="flex items-center gap-0.5">
              <LinkIcon className="h-2.5 w-2.5" /> @{group.username}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
