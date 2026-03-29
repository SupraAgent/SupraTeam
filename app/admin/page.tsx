"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useShell } from "@/app/_components/shell/shell-context";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────

type TeamMember = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  github_username: string | null;
  telegram_id: number | null;
  email: string | null;
  crm_role: string | null;
  created_at: string;
};

type AuditEntry = {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target_id: string | null;
  target_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

// ─── Constants ─────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "bd_lead", label: "BD Lead" },
  { value: "marketing_lead", label: "Marketing Lead" },
  { value: "admin_lead", label: "Admin Lead" },
];

const ROLE_COLORS: Record<string, string> = {
  bd_lead: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  marketing_lead: "border-purple-500/20 bg-purple-500/10 text-purple-400",
  admin_lead: "border-amber-500/20 bg-amber-500/10 text-amber-400",
};

const ACTION_LABELS: Record<string, string> = {
  role_change: "Changed role",
  member_remove: "Removed member",
};

function formatRole(role: string | null): string {
  if (!role) return "No role";
  return role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Main Page ─────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();
  const { crmRole } = useShell();
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"team" | "audit">("team");
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    if (crmRole === null && !checked) {
      // Wait briefly for crmRole to load
      const timer = setTimeout(() => setChecked(true), 1500);
      return () => clearTimeout(timer);
    }
    if (crmRole && crmRole !== "admin_lead") {
      router.push("/");
    }
    if (crmRole === "admin_lead") {
      setChecked(true);
    }
  }, [user, crmRole, checked, router]);

  if (!checked || crmRole !== "admin_lead") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage team members, roles, and view activity.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-white/[0.035] border border-white/10 p-1 w-fit">
        {(["team", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "team" ? "Team" : "Audit Log"}
          </button>
        ))}
      </div>

      {activeTab === "team" ? <TeamTab /> : <AuditTab />}
    </div>
  );
}

// ─── Team Tab ──────────────────────────────────────────────────────

function TeamTab() {
  const { user } = useAuth();
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setMembers(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function updateRole(userId: string, role: string | null) {
    setUpdatingId(userId);
    setMsg("");
    try {
      const res = await fetch("/api/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, crm_role: role }),
      });
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, crm_role: role } : m))
        );
        setMsg("Role updated");
      } else {
        const data = await res.json();
        setMsg(data.error ?? "Failed to update role");
      }
    } finally {
      setUpdatingId(null);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  async function removeMember(userId: string) {
    setUpdatingId(userId);
    setMsg("");
    try {
      const res = await fetch("/api/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, crm_role: null } : m))
        );
        setMsg("Member removed");
      } else {
        const data = await res.json();
        setMsg(data.error ?? "Failed to remove member");
      }
    } finally {
      setUpdatingId(null);
      setConfirmRemoveId(null);
      setTimeout(() => setMsg(""), 3000);
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
      {msg && <span className="text-xs text-primary">{msg}</span>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{members.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-blue-400">
            {members.filter((m) => m.crm_role === "bd_lead").length}
          </p>
          <p className="text-xs text-muted-foreground">BD Leads</p>
        </div>
        <div className="rounded-xl border border-purple-500/10 bg-purple-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-purple-400">
            {members.filter((m) => m.crm_role === "marketing_lead").length}
          </p>
          <p className="text-xs text-muted-foreground">Marketing</p>
        </div>
        <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-3 text-center">
          <p className="text-lg font-semibold text-amber-400">
            {members.filter((m) => m.crm_role === "admin_lead").length}
          </p>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
      </div>

      {/* Member list */}
      <div className="space-y-2">
        {members.map((member) => {
          const isSelf = member.id === user?.id;
          return (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"
            >
              {/* Avatar */}
              <div className="h-9 w-9 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground">
                    {member.display_name?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {member.display_name ?? "Unknown"}
                  {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {member.email && !member.email.endsWith("@supracrm.tg") && (
                    <span className="truncate">{member.email}</span>
                  )}
                  {member.telegram_id && <span>TG #{member.telegram_id}</span>}
                  {member.github_username && <span>@{member.github_username}</span>}
                </div>
              </div>

              {/* Role badge */}
              {member.crm_role && (
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs ${ROLE_COLORS[member.crm_role] ?? "border-white/10 bg-white/5 text-muted-foreground"}`}
                >
                  {formatRole(member.crm_role)}
                </span>
              )}

              {/* Role selector */}
              <Select
                value={member.crm_role ?? ""}
                onChange={(e) => updateRole(member.id, e.target.value || null)}
                options={ROLE_OPTIONS}
                placeholder="No role"
                className="w-40"
                disabled={updatingId === member.id}
              />

              {/* Remove button */}
              {!isSelf && (
                confirmRemoveId === member.id ? (
                  <button
                    onClick={() => removeMember(member.id)}
                    disabled={updatingId === member.id}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    Confirm?
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setConfirmRemoveId(member.id);
                      setTimeout(() => setConfirmRemoveId(null), 3000);
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Remove member"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                )
              )}
            </div>
          );
        })}

        {members.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
            No team members found. Users will appear here once they sign in.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Audit Log Tab ─────────────────────────────────────────────────

function AuditTab() {
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);

  const fetchPage = React.useCallback(async (p: number) => {
    const res = await fetch(`/api/admin/audit?page=${p}&limit=50`);
    if (!res.ok) return;
    const { data } = await res.json();
    if (data.length < 50) setHasMore(false);
    setEntries((prev) => (p === 1 ? data : [...prev, ...data]));
  }, []);

  React.useEffect(() => {
    fetchPage(1).finally(() => setLoading(false));
  }, [fetchPage]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchPage(next);
  }

  function describeAction(entry: AuditEntry): string {
    const label = ACTION_LABELS[entry.action] ?? entry.action;
    const details = entry.details as Record<string, string | null>;

    if (entry.action === "role_change") {
      return `${label}: ${formatRole(details.old_role ?? null)} → ${formatRole(details.new_role ?? null)}`;
    }
    if (entry.action === "member_remove") {
      return `${label}${details.display_name ? ` (${details.display_name})` : ""}`;
    }
    return label;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-white/[0.02] animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
        No audit log entries yet. Actions will be recorded here when team roles are changed or members are removed.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"
        >
          {/* Icon */}
          <div className={cn(
            "mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0",
            entry.action === "member_remove"
              ? "bg-red-500/10 text-red-400"
              : "bg-primary/10 text-primary"
          )}>
            {entry.action === "member_remove" ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="18" y1="8" x2="23" y2="13" />
                <line x1="23" y1="8" x2="18" y2="13" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">
              <span className="font-medium">{entry.actor_name}</span>
              {" "}
              <span className="text-muted-foreground">{describeAction(entry)}</span>
              {entry.target_name && entry.action === "role_change" && (
                <>
                  {" for "}
                  <span className="font-medium">{entry.target_name}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {timeAgo(entry.created_at)}
              {" · "}
              {new Date(entry.created_at).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full rounded-xl border border-white/10 bg-white/[0.02] py-2.5 text-sm text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}
