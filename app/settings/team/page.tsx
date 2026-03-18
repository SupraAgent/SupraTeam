"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";

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

export default function TeamSettingsPage() {
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
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
        setMsg("Failed to update role");
      }
    } finally {
      setUpdatingId(null);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage team members and assign CRM roles.
          </p>
        </div>
        {msg && <span className="text-xs text-primary">{msg}</span>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
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
        {members.map((member) => (
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
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {member.email && !member.email.endsWith("@supracrm.tg") && (
                  <span className="truncate">{member.email}</span>
                )}
                {member.telegram_id && (
                  <span>TG #{member.telegram_id}</span>
                )}
                {member.github_username && (
                  <span>@{member.github_username}</span>
                )}
              </div>
            </div>

            {/* Current role badge */}
            {member.crm_role && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs ${ROLE_COLORS[member.crm_role] ?? "border-white/10 bg-white/5 text-muted-foreground"}`}
              >
                {member.crm_role.replace("_", " ")}
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
          </div>
        ))}

        {members.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
            No team members found. Users will appear here once they sign in.
          </div>
        )}
      </div>
    </div>
  );
}
