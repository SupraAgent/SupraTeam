"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save } from "lucide-react";

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  github_username: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  email: string | null;
  crm_role: string | null;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");

  React.useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) {
          setProfile(res.data);
          setDisplayName(res.data.display_name ?? "");
          setAvatarUrl(res.data.avatar_url ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, avatar_url: avatarUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile((prev) => (prev ? { ...prev, ...data.data } : prev));
        setMsg("Profile saved");
      } else {
        setMsg("Failed to save");
      }
    } finally {
      setSaving(false);
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

  const telegramUsername = profile?.telegram_username ?? user?.user_metadata?.telegram_username;
  const githubUsername = profile?.github_username ?? user?.user_metadata?.user_name;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and account settings.
        </p>
      </div>

      {/* Profile Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">Profile</h2>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-primary">{msg}</span>}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-5">
          {/* Avatar preview + name */}
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">
                  {displayName?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {displayName || "No name set"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.email ?? user?.email ?? "No email"}
              </p>
            </div>
          </div>

          {/* Editable fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Display Name</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Avatar URL</label>
              <Input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Connected Accounts */}
      <section className="space-y-4">
        <h2 className="text-base font-medium text-foreground">Connected Accounts</h2>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
          {/* Telegram */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#229ED9]/20 flex items-center justify-center">
                <svg className="h-4 w-4 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Telegram</p>
                {telegramUsername ? (
                  <p className="text-xs text-muted-foreground">@{telegramUsername}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            {telegramUsername ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
                Connected
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                Not linked
              </span>
            )}
          </div>

          <div className="border-t border-white/5" />

          {/* GitHub */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="h-4 w-4 text-foreground" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">GitHub</p>
                {githubUsername ? (
                  <p className="text-xs text-muted-foreground">@{githubUsername}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            {githubUsername ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
                Connected
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                Not linked
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Account Info */}
      <section className="space-y-4">
        <h2 className="text-base font-medium text-foreground">Account</h2>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">User ID</span>
            <span className="text-xs text-foreground font-mono">{user?.id?.slice(0, 8)}...</span>
          </div>
          {profile?.crm_role && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">CRM Role</span>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">
                {profile.crm_role.replace("_", " ")}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Telegram ID</span>
            <span className="text-xs text-foreground font-mono">
              {profile?.telegram_id ?? user?.user_metadata?.telegram_id ?? "—"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
