"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Hash,
  Unplug,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Lock,
  Users,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
}

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
}

interface UserMapping {
  id: string;
  telegram_user_id: number;
  telegram_username: string;
  slack_user_id: string;
  slack_display_name: string | null;
  created_at: string;
  updated_at: string;
}

export default function SlackSettingsPage() {
  // Connection state
  const [connected, setConnected] = React.useState(false);
  const [team, setTeam] = React.useState<string | null>(null);
  const [botUser, setBotUser] = React.useState<string | null>(null);
  const [connLoading, setConnLoading] = React.useState(true);
  const [token, setToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [connError, setConnError] = React.useState("");
  const [disconnecting, setDisconnecting] = React.useState(false);

  // User mappings state
  const [mappings, setMappings] = React.useState<UserMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = React.useState(true);
  const [slackUsers, setSlackUsers] = React.useState<SlackUser[]>([]);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [addTgUsername, setAddTgUsername] = React.useState("");
  const [addSlackUserId, setAddSlackUserId] = React.useState("");
  const [addSaving, setAddSaving] = React.useState(false);
  const [addError, setAddError] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTgUsername, setEditTgUsername] = React.useState("");
  const [editSlackUserId, setEditSlackUserId] = React.useState("");

  // Channels state
  const [channels, setChannels] = React.useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = React.useState(true);

  // Check connection
  React.useEffect(() => {
    fetch("/api/slack")
      .then((r) => r.json())
      .then((data) => {
        setConnected(data.connected);
        setTeam(data.team ?? null);
        setBotUser(data.bot_user ?? null);
      })
      .finally(() => setConnLoading(false));
  }, []);

  // Load mappings, channels, and Slack users when connected
  React.useEffect(() => {
    if (!connected) {
      setMappingsLoading(false);
      setChannelsLoading(false);
      return;
    }

    fetch("/api/slack/user-mappings")
      .then((r) => r.json())
      .then((d) => setMappings(d.data ?? []))
      .finally(() => setMappingsLoading(false));

    fetch("/api/slack/channels")
      .then((r) => r.json())
      .then((d) => setChannels(d.data ?? []))
      .finally(() => setChannelsLoading(false));

    fetch("/api/slack/users")
      .then((r) => r.json())
      .then((d) => setSlackUsers(d.data ?? []));
  }, [connected]);

  async function handleConnect() {
    if (!token.trim()) return;
    setSaving(true);
    setConnError("");
    try {
      const res = await fetch("/api/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setConnected(true);
        setTeam(data.team);
        setBotUser(data.bot_user);
        setToken("");
      } else {
        setConnError(data.error ?? "Failed to connect");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Slack? Workflow actions that send to Slack will stop working.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/slack", { method: "DELETE" });
      setConnected(false);
      setTeam(null);
      setBotUser(null);
      setMappings([]);
      setChannels([]);
    } finally {
      setDisconnecting(false);
    }
  }

  // Mapping CRUD
  async function handleAddMapping() {
    if (!addTgUsername.trim() || !addSlackUserId) return;
    setAddSaving(true);
    setAddError("");
    try {
      const slackUser = slackUsers.find((u) => u.id === addSlackUserId);
      const res = await fetch("/api/slack/user-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_username: addTgUsername.trim().replace(/^@/, ""),
          slack_user_id: addSlackUserId,
          slack_display_name: slackUser?.display_name || slackUser?.real_name || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMappings((prev) => [data.data, ...prev]);
        setAddTgUsername("");
        setAddSlackUserId("");
        setShowAddForm(false);
      } else {
        setAddError(data.error ?? "Failed to add");
      }
    } finally {
      setAddSaving(false);
    }
  }

  function startEdit(m: UserMapping) {
    setEditingId(m.id);
    setEditTgUsername(m.telegram_username || "");
    setEditSlackUserId(m.slack_user_id);
  }

  async function handleSaveEdit(id: string) {
    const slackUser = slackUsers.find((u) => u.id === editSlackUserId);
    const res = await fetch(`/api/slack/user-mappings/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram_username: editTgUsername.trim().replace(/^@/, ""),
        slack_user_id: editSlackUserId,
        slack_display_name: slackUser?.display_name || slackUser?.real_name || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setMappings((prev) => prev.map((m) => (m.id === id ? data.data : m)));
      setEditingId(null);
    }
  }

  async function handleDeleteMapping(id: string) {
    if (!confirm("Remove this user mapping?")) return;
    const res = await fetch(`/api/slack/user-mappings/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMappings((prev) => prev.filter((m) => m.id !== id));
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Slack</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Slack workspace and manage user identity mappings for @mentions.
        </p>
      </div>

      {/* ─── Connection ─── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider text-muted-foreground">Connection</h2>

        {connLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm text-muted-foreground">
            Checking Slack connection...
          </div>
        ) : connected ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-white/[0.035] p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#4A154B]/20 flex items-center justify-center">
                  <Hash className="h-5 w-5 text-[#E01E5A]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Connected to Slack</p>
                  <p className="text-xs text-muted-foreground">
                    {team && <span>Workspace: <span className="text-foreground">{team}</span></span>}
                    {botUser && <span> · Bot: <span className="text-foreground">{botUser}</span></span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
                  Connected
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  <Unplug className="h-3.5 w-3.5 mr-1" />
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Slack Bot Token</label>
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="xoxb-..."
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleConnect} disabled={saving || !token.trim()}>
                  {saving ? "Verifying..." : "Connect Slack"}
                </Button>
                {connError && <p className="text-xs text-red-400">{connError}</p>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The token is verified with Slack, then encrypted (AES-256-GCM) before storage.
            </p>

            {/* Setup Guide */}
            <div className="border-t border-white/5 pt-4 space-y-2">
              <h3 className="text-xs font-medium text-foreground">Setup Guide</h3>
              <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
                <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">api.slack.com/apps</a> and create a new app</li>
                <li>Under <strong>OAuth &amp; Permissions</strong>, add scopes: <code className="rounded bg-white/5 px-1 py-0.5">chat:write</code>, <code className="rounded bg-white/5 px-1 py-0.5">channels:read</code>, <code className="rounded bg-white/5 px-1 py-0.5">users:read</code></li>
                <li>Install the app to your workspace</li>
                <li>Copy the <strong>Bot User OAuth Token</strong> (<code className="rounded bg-white/5 px-1 py-0.5">xoxb-...</code>) and paste it above</li>
                <li>Invite the bot to channels: <code className="rounded bg-white/5 px-1 py-0.5">/invite @YourBot</code></li>
              </ol>
            </div>
          </div>
        )}
      </section>

      {/* ─── User Mappings ─── */}
      {connected && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">User Mappings</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Map Telegram usernames to Slack users for automatic @mentions in workflow alerts.
              </p>
            </div>
            {!showAddForm && (
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Mapping
              </Button>
            )}
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="rounded-2xl border border-primary/20 bg-white/[0.035] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Telegram Username</label>
                  <Input
                    value={addTgUsername}
                    onChange={(e) => setAddTgUsername(e.target.value)}
                    placeholder="@username"
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Slack User</label>
                  <select
                    value={addSlackUserId}
                    onChange={(e) => setAddSlackUserId(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none h-9"
                  >
                    <option value="">Select a user...</option>
                    {slackUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        @{u.display_name || u.real_name || u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleAddMapping} disabled={addSaving || !addTgUsername.trim() || !addSlackUserId}>
                  {addSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setAddError(""); }}>
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Mappings table */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
            {mappingsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading mappings...</div>
            ) : mappings.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground/50">No user mappings yet</p>
                <p className="text-xs text-muted-foreground/30 mt-1">Add mappings to auto @mention Slack users in workflow alerts</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                    <th className="text-left px-4 py-2.5 font-medium">Telegram</th>
                    <th className="text-left px-4 py-2.5 font-medium">Slack User</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {mappings.map((m) => (
                    <tr key={m.id} className="group">
                      {editingId === m.id ? (
                        <>
                          <td className="px-4 py-2">
                            <Input
                              value={editTgUsername}
                              onChange={(e) => setEditTgUsername(e.target.value)}
                              className="text-xs h-8"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={editSlackUserId}
                              onChange={(e) => setEditSlackUserId(e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
                            >
                              <option value="">Select...</option>
                              {slackUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  @{u.display_name || u.real_name || u.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleSaveEdit(m.id)} className="h-7 w-7 rounded-md hover:bg-white/5 flex items-center justify-center text-emerald-400">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="h-7 w-7 rounded-md hover:bg-white/5 flex items-center justify-center text-muted-foreground">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-xs text-foreground">
                            @{m.telegram_username}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            @{m.slack_display_name || m.slack_user_id}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEdit(m)} className="h-7 w-7 rounded-md hover:bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => handleDeleteMapping(m.id)} className="h-7 w-7 rounded-md hover:bg-white/5 flex items-center justify-center text-muted-foreground hover:text-red-400">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ─── Channels ─── */}
      {connected && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Channels</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Channels the bot can post to. Invite the bot to more channels with <code className="rounded bg-white/5 px-1 py-0.5">/invite @YourBot</code>.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
            {channelsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading channels...</div>
            ) : channels.length === 0 ? (
              <div className="p-8 text-center">
                <Hash className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground/50">No channels found</p>
                <p className="text-xs text-muted-foreground/30 mt-1">Invite the bot to Slack channels to see them here</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                    <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                    <th className="text-left px-4 py-2.5 font-medium w-24">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Members</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {channels.map((ch) => (
                    <tr key={ch.id}>
                      <td className="px-4 py-2.5 text-xs text-foreground flex items-center gap-2">
                        <Hash className="h-3 w-3 text-muted-foreground/40" />
                        {ch.name}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {ch.is_private ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Lock className="h-3 w-3" /> Private
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">Public</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground text-right">
                        {ch.num_members}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
