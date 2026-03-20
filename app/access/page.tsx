"use client";

import * as React from "react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Shield, Check, X, Plus, UserPlus, UserMinus, History, Link2, Loader2,
} from "lucide-react";

type Grant = {
  id: string;
  user_id: string;
  slug: string;
  granted_at: string;
  granted_by: string;
  user_name: string | null;
  user_avatar: string | null;
  granter_name: string | null;
};

type TeamMember = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  telegram_id: number | null;
};

type LogEntry = {
  id: string;
  action: string;
  target_user_id: string;
  slug: string;
  groups_affected: unknown;
  performed_by: string;
  status: string;
  error_log: string | null;
  created_at: string;
  performer_name: string | null;
  target_name: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type Tab = "matrix" | "log" | "audit";

export default function AccessControlPage() {
  const [tab, setTab] = React.useState<Tab>("matrix");
  const [grants, setGrants] = React.useState<Grant[]>([]);
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [allSlugs, setAllSlugs] = React.useState<string[]>([]);
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newSlug, setNewSlug] = React.useState("");
  const [bulkLoading, setBulkLoading] = React.useState<string | null>(null);
  const [bulkSlugAction, setBulkSlugAction] = React.useState<{ slug: string; action: "add_to_groups" | "remove_from_groups" } | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const [grantsRes, teamRes, slugsRes] = await Promise.all([
        fetch("/api/access"),
        fetch("/api/team"),
        fetch("/api/groups/slugs"),
      ]);
      if (grantsRes.ok) {
        const data = await grantsRes.json();
        setGrants(data.grants ?? []);
      }
      if (teamRes.ok) {
        const data = await teamRes.json();
        setMembers(data.data ?? []);
      }
      if (slugsRes.ok) {
        const data = await slugsRes.json();
        const slugs = [...new Set((data.slugs ?? []).map((s: { slug: string }) => s.slug))].sort() as string[];
        setAllSlugs(slugs);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = React.useCallback(async () => {
    const res = await fetch("/api/access/log");
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs ?? []);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchAuditLogs = React.useCallback(async () => {
    const res = await fetch("/api/audit-log?entity_type=access&limit=50");
    if (res.ok) {
      const data = await res.json();
      setAuditLogs(data.logs ?? []);
    }
  }, []);

  React.useEffect(() => {
    if (tab === "log") fetchLogs();
    if (tab === "audit") fetchAuditLogs();
  }, [tab, fetchLogs, fetchAuditLogs]);

  function hasAccess(userId: string, slug: string): boolean {
    return grants.some((g) => g.user_id === userId && g.slug === slug);
  }

  async function toggleAccess(userId: string, slug: string) {
    const has = hasAccess(userId, slug);
    if (has) {
      // Revoke
      const res = await fetch(`/api/access/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setGrants((prev) => prev.filter((g) => !(g.user_id === userId && g.slug === slug)));
        toast.success("Access revoked");
      } else {
        toast.error("Failed to revoke access");
      }
    } else {
      // Grant
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, slug }),
      });
      if (res.ok) {
        const data = await res.json();
        setGrants((prev) => [...prev, data.grant]);
        toast.success("Access granted");
      } else {
        toast.error("Failed to grant access");
      }
    }
  }

  async function handleBulkAction(userId: string, slug: string, action: "add_to_groups" | "remove_from_groups") {
    const key = `${action}-${userId}-${slug}`;
    setBulkLoading(key);
    try {
      const res = await fetch("/api/access/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, user_id: userId, slug }),
      });
      const data = await res.json();
      if (res.ok) {
        if (action === "add_to_groups" && data.invite_links?.length) {
          toast.success(`Created ${data.invite_links.length} invite link(s)`);
        } else {
          toast.success(`${action === "remove_from_groups" ? "Removed from" : "Added to"} ${data.results?.length ?? 0} group(s)`);
        }
      } else {
        toast.error(data.error ?? "Bulk action failed");
      }
    } finally {
      setBulkLoading(null);
    }
  }

  function handleAddSlug(e: React.FormEvent) {
    e.preventDefault();
    const slug = newSlug.trim().toLowerCase();
    if (slug && !allSlugs.includes(slug)) {
      setAllSlugs((prev) => [...prev, slug].sort());
      setNewSlug("");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Access Control</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage who has access to slug-tagged Telegram groups.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{members.length}</p>
          <p className="text-xs text-muted-foreground">Team Members</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{allSlugs.length}</p>
          <p className="text-xs text-muted-foreground">Slugs</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{grants.length}</p>
          <p className="text-xs text-muted-foreground">Active Grants</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">
            {members.filter((m) => m.telegram_id).length}
          </p>
          <p className="text-xs text-muted-foreground">TG Linked</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        <button
          onClick={() => setTab("matrix")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "matrix" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Shield className="inline h-4 w-4 mr-1.5" />
          Access Matrix
        </button>
        <button
          onClick={() => setTab("log")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "log" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <History className="inline h-4 w-4 mr-1.5" />
          Access Log
        </button>
        <button
          onClick={() => setTab("audit")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "audit" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Shield className="inline h-4 w-4 mr-1.5" />
          Audit Trail
        </button>
      </div>

      {/* Matrix tab */}
      {tab === "matrix" && (
        <div className="space-y-4">
          {/* Add slug */}
          <form onSubmit={handleAddSlug} className="flex items-center gap-2">
            <Input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="Add slug to matrix..."
              className="max-w-[200px] h-8 text-xs"
            />
            <Button type="submit" size="sm" variant="ghost" disabled={!newSlug.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Slug
            </Button>
          </form>

          {allSlugs.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <Shield className="mx-auto h-8 w-8 text-muted-foreground/20" />
              <p className="mt-2 text-sm text-muted-foreground">No slugs configured yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Add slug tags to your TG Groups first, then manage access here.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground sticky left-0 bg-[hsl(225,35%,5%)] z-10 min-w-[180px]">
                        Team Member
                      </th>
                      {allSlugs.map((slug) => (
                        <th key={slug} className="px-3 py-2.5 text-center min-w-[100px]">
                          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{slug}</span>
                          <div className="flex justify-center gap-0.5 mt-1">
                            <button
                              onClick={() => {
                                // Bulk add all members with TG to this slug's groups
                                const tgMembers = members.filter((m) => m.telegram_id && hasAccess(m.id, slug));
                                if (tgMembers.length === 0) { toast.error("No TG-linked members with this access"); return; }
                                setBulkSlugAction({ slug, action: "add_to_groups" });
                              }}
                              className="rounded px-1 py-0.5 text-[8px] text-blue-400 hover:bg-blue-500/10 transition"
                              title="Bulk add all to groups"
                            >
                              +All
                            </button>
                            <button
                              onClick={() => {
                                const tgMembers = members.filter((m) => m.telegram_id && hasAccess(m.id, slug));
                                if (tgMembers.length === 0) { toast.error("No TG-linked members with this access"); return; }
                                setBulkSlugAction({ slug, action: "remove_from_groups" });
                              }}
                              className="rounded px-1 py-0.5 text-[8px] text-red-400 hover:bg-red-500/10 transition"
                              title="Bulk remove all from groups"
                            >
                              -All
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 sticky left-0 bg-[hsl(225,35%,5%)] z-10">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                              {member.avatar_url ? (
                                <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[11px] font-semibold text-muted-foreground">
                                  {member.display_name?.charAt(0)?.toUpperCase() ?? "?"}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {member.display_name ?? "Unknown"}
                              </p>
                              {member.telegram_id ? (
                                <p className="text-[10px] text-primary">TG linked</p>
                              ) : (
                                <p className="text-[10px] text-muted-foreground/40">No TG</p>
                              )}
                            </div>
                          </div>
                        </td>
                        {allSlugs.map((slug) => {
                          const has = hasAccess(member.id, slug);
                          const loadingAdd = bulkLoading === `add_to_groups-${member.id}-${slug}`;
                          const loadingRemove = bulkLoading === `remove_from_groups-${member.id}-${slug}`;
                          return (
                            <td key={slug} className="px-3 py-2.5 text-center">
                              <div className="flex flex-col items-center gap-1">
                                {/* Toggle access grant */}
                                <button
                                  onClick={() => toggleAccess(member.id, slug)}
                                  className={cn(
                                    "h-7 w-7 rounded-lg flex items-center justify-center transition",
                                    has
                                      ? "bg-primary/20 text-primary hover:bg-primary/30"
                                      : "bg-white/5 text-muted-foreground/30 hover:bg-white/10 hover:text-muted-foreground"
                                  )}
                                  title={has ? "Revoke access" : "Grant access"}
                                >
                                  {has ? <Check className="h-3.5 w-3.5" /> : <X className="h-3 w-3" />}
                                </button>
                                {/* Bulk TG actions (only if has TG + access granted) */}
                                {has && member.telegram_id && (
                                  <div className="flex gap-0.5">
                                    <button
                                      onClick={() => handleBulkAction(member.id, slug, "add_to_groups")}
                                      disabled={!!bulkLoading}
                                      className="rounded p-0.5 text-[9px] text-blue-400 hover:bg-blue-500/10 transition"
                                      title="Get invite links"
                                    >
                                      {loadingAdd ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                    </button>
                                    <button
                                      onClick={() => handleBulkAction(member.id, slug, "remove_from_groups")}
                                      disabled={!!bulkLoading}
                                      className="rounded p-0.5 text-[9px] text-red-400 hover:bg-red-500/10 transition"
                                      title="Remove from groups"
                                    >
                                      {loadingRemove ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk slug action bar */}
      {bulkSlugAction && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-white/10 bg-[hsl(225,35%,8%)] shadow-2xl px-5 py-3 flex items-center gap-4">
          <p className="text-sm text-foreground">
            {bulkSlugAction.action === "add_to_groups" ? (
              <><UserPlus className="inline h-4 w-4 text-blue-400 mr-1" />Add all members with <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-medium">{bulkSlugAction.slug}</span> access to groups?</>
            ) : (
              <><UserMinus className="inline h-4 w-4 text-red-400 mr-1" />Remove all members with <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-medium">{bulkSlugAction.slug}</span> access from groups?</>
            )}
          </p>
          <Button
            size="sm"
            variant={bulkSlugAction.action === "add_to_groups" ? "default" : "outline"}
            disabled={!!bulkLoading}
            onClick={async () => {
              const { slug, action } = bulkSlugAction;
              const tgMembers = members.filter((m) => m.telegram_id && hasAccess(m.id, slug));
              setBulkLoading("bulk-slug");
              let successCount = 0;
              for (const m of tgMembers) {
                try {
                  const res = await fetch("/api/access/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, user_id: m.id, slug }),
                  });
                  if (res.ok) successCount++;
                } catch { /* continue */ }
              }
              toast.success(`${action === "add_to_groups" ? "Added" : "Removed"} ${successCount}/${tgMembers.length} member(s)`);
              setBulkLoading(null);
              setBulkSlugAction(null);
            }}
          >
            {bulkLoading === "bulk-slug" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Confirm ({members.filter((m) => m.telegram_id && hasAccess(m.id, bulkSlugAction.slug)).length} members)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBulkSlugAction(null)}>Cancel</Button>
        </div>
      )}

      {/* Access log tab */}
      {tab === "log" && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <History className="mx-auto h-8 w-8 text-muted-foreground/20" />
              <p className="mt-2 text-sm text-muted-foreground">No access changes recorded yet.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {log.action === "add_to_groups" ? (
                      <UserPlus className="h-4 w-4 text-green-400 shrink-0" />
                    ) : (
                      <UserMinus className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{log.performer_name ?? "Unknown"}</span>
                        {" "}
                        {log.action === "add_to_groups" ? "added" : "removed"}
                        {" "}
                        <span className="font-medium">{log.target_name ?? "Unknown"}</span>
                        {" "}
                        {log.action === "add_to_groups" ? "to" : "from"}
                        {" "}
                        <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs">{log.slug}</span>
                        {" "}groups
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          log.status === "success" && "bg-green-500/20 text-green-400",
                          log.status === "partial_failure" && "bg-yellow-500/20 text-yellow-400",
                          log.status === "failed" && "bg-red-500/20 text-red-400",
                        )}>
                          {log.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">{timeAgo(log.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {log.error_log && (
                  <p className="mt-2 text-[11px] text-red-400/70 bg-red-500/5 rounded px-2 py-1">{log.error_log}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Audit trail tab */}
      {tab === "audit" && (
        <div className="space-y-2">
          {auditLogs.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <Shield className="mx-auto h-8 w-8 text-muted-foreground/20" />
              <p className="mt-2 text-sm text-muted-foreground">No audit entries yet.</p>
            </div>
          ) : (
            auditLogs.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {entry.action.includes("add") || entry.action.includes("grant") ? (
                      <UserPlus className="h-4 w-4 text-green-400 shrink-0" />
                    ) : entry.action.includes("remove") || entry.action.includes("revoke") ? (
                      <UserMinus className="h-4 w-4 text-red-400 shrink-0" />
                    ) : entry.action.includes("move") ? (
                      <History className="h-4 w-4 text-blue-400 shrink-0" />
                    ) : (
                      <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div>
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{entry.actor_name ?? "System"}</span>
                        {" "}
                        <span className="text-muted-foreground">{entry.action.replace(/_/g, " ")}</span>
                        {entry.entity_id && (
                          <>
                            {" on "}
                            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs">{entry.entity_id}</span>
                          </>
                        )}
                      </p>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {Object.entries(entry.details).map(([k, v]) => (
                            <span key={k} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(entry.created_at)}</p>
                    </div>
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
