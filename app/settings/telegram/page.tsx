"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageCircle,
  Check,
  X,
  RefreshCw,
  Plus,
  Trash2,
  Star,
  StarOff,
  Wifi,
  WifiOff,
  Bot,
  ChevronDown,
  ChevronUp,
  Hash,
  Link2,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BotRecord = {
  id: string;
  label: string;
  bot_username: string | null;
  bot_first_name: string | null;
  bot_telegram_id: number | null;
  is_active: boolean;
  is_default: boolean;
  groups_count: number;
  last_verified_at: string | null;
  created_at: string;
};

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_message?: string;
  bot_id?: string;
  label?: string;
};

export default function TelegramSettingsPage() {
  const [bots, setBots] = React.useState<BotRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [newToken, setNewToken] = React.useState("");
  const [newLabel, setNewLabel] = React.useState("");
  const [addError, setAddError] = React.useState("");
  const [settingUp, setSettingUp] = React.useState(false);
  const [setupResult, setSetupResult] = React.useState<string | null>(null);
  const [expandedBot, setExpandedBot] = React.useState<string | null>(null);
  const [webhookInfos, setWebhookInfos] = React.useState<Record<string, WebhookInfo>>({});

  // Slack integration state
  const [slackConnected, setSlackConnected] = React.useState(false);
  const [slackTeam, setSlackTeam] = React.useState<string | null>(null);
  const [slackBotUser, setSlackBotUser] = React.useState<string | null>(null);
  const [slackToken, setSlackToken] = React.useState("");
  const [slackAdding, setSlackAdding] = React.useState(false);
  const [slackError, setSlackError] = React.useState("");
  const [slackLoading, setSlackLoading] = React.useState(true);

  async function fetchBots() {
    setLoading(true);
    try {
      const res = await fetch("/api/bots");
      if (res.ok) {
        const { data } = await res.json();
        setBots(data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchBots(); }, []);

  async function fetchSlackStatus() {
    setSlackLoading(true);
    try {
      const res = await fetch("/api/slack");
      if (res.ok) {
        const data = await res.json();
        setSlackConnected(data.connected);
        setSlackTeam(data.team ?? null);
        setSlackBotUser(data.bot_user ?? null);
      }
    } finally {
      setSlackLoading(false);
    }
  }

  React.useEffect(() => { fetchSlackStatus(); }, []);

  async function handleConnectSlack() {
    if (!slackToken.trim()) return;
    setSlackAdding(true);
    setSlackError("");
    try {
      const res = await fetch("/api/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: slackToken.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSlackConnected(true);
        setSlackTeam(data.team);
        setSlackBotUser(data.bot_user);
        setSlackToken("");
      } else {
        const err = await res.json().catch(() => ({}));
        setSlackError(err.error ?? "Failed to connect Slack");
      }
    } finally {
      setSlackAdding(false);
    }
  }

  async function handleDisconnectSlack() {
    if (!confirm("Disconnect Slack? Existing workflow automations using Slack will stop working.")) return;
    await fetch("/api/slack", { method: "DELETE" });
    setSlackConnected(false);
    setSlackTeam(null);
    setSlackBotUser(null);
  }

  async function handleAddBot() {
    if (!newToken.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: newToken.trim(), label: newLabel.trim() || undefined }),
      });
      if (res.ok) {
        setNewToken("");
        setNewLabel("");
        await fetchBots();
      } else {
        const err = await res.json().catch(() => ({}));
        setAddError(err.error ?? "Failed to add bot");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this bot? Groups will be unlinked.")) return;
    await fetch(`/api/bots/${id}`, { method: "DELETE" });
    await fetchBots();
  }

  async function handleSetDefault(id: string) {
    await fetch(`/api/bots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });
    await fetchBots();
  }

  async function handleToggleActive(id: string, currentlyActive: boolean) {
    await fetch(`/api/bots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !currentlyActive }),
    });
    await fetchBots();
  }

  async function handleSetupWebhooks() {
    setSettingUp(true);
    setSetupResult(null);
    try {
      const res = await fetch("/api/bot/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setSetupResult(`Webhooks configured for ${data.bots_configured} bot(s)`);
        // Fetch webhook info for each bot
        for (const bot of bots) {
          const whRes = await fetch(`/api/bot/setup?botId=${bot.id}`);
          if (whRes.ok) {
            const whData = await whRes.json();
            setWebhookInfos((prev) => ({ ...prev, [bot.id]: whData }));
          }
        }
      } else {
        setSetupResult(`Failed: ${data.error ?? "Unknown error"}`);
      }
    } finally {
      setSettingUp(false);
      setTimeout(() => setSetupResult(null), 8000);
    }
  }

  async function handleCheckWebhook(botId: string) {
    const res = await fetch(`/api/bot/setup?botId=${botId}`);
    if (res.ok) {
      const data = await res.json();
      setWebhookInfos((prev) => ({ ...prev, [botId]: data }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Telegram Bots</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register multiple bots, assign them to groups, and manage webhooks.
        </p>
      </div>

      {/* Bot List */}
      <div className="space-y-3">
        {loading && bots.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm text-muted-foreground">
            Loading bots...
          </div>
        )}

        {!loading && bots.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center space-y-2">
            <Bot className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No bots registered yet. Add your first bot below.</p>
          </div>
        )}

        {bots.map((bot) => {
          const isExpanded = expandedBot === bot.id;
          const wh = webhookInfos[bot.id];

          return (
            <div
              key={bot.id}
              className={cn(
                "rounded-2xl border bg-white/[0.035] p-4 transition-colors",
                bot.is_default ? "border-primary/30" : "border-white/10",
                !bot.is_active && "opacity-50"
              )}
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                    bot.is_active ? "bg-[#2AABEE]/10" : "bg-white/5"
                  )}>
                    <MessageCircle className={cn("h-5 w-5", bot.is_active ? "text-[#2AABEE]" : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{bot.label}</p>
                      {bot.is_default && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary shrink-0">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {bot.bot_username ? `@${bot.bot_username}` : "Unknown"} · {bot.groups_count} group{bot.groups_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!bot.is_default && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      title="Set as default"
                      onClick={() => handleSetDefault(bot.id)}
                    >
                      <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                  {bot.is_default && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled title="Default bot">
                      <Star className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title={bot.is_active ? "Deactivate" : "Activate"}
                    onClick={() => handleToggleActive(bot.id, bot.is_active)}
                  >
                    {bot.is_active ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-red-400" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setExpandedBot(isExpanded ? null : bot.id)}
                  >
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                    title="Remove bot"
                    onClick={() => handleDelete(bot.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Bot ID</span>
                      <p className="text-foreground font-mono">{bot.bot_telegram_id ?? "--"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Groups managed</span>
                      <p className="text-foreground">{bot.groups_count}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last verified</span>
                      <p className="text-foreground">{bot.last_verified_at ? new Date(bot.last_verified_at).toLocaleString() : "Never"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Added</span>
                      <p className="text-foreground">{new Date(bot.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Webhook status */}
                  {wh && (
                    <div className="rounded-xl bg-white/[0.03] p-3 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Webhook</span>
                        <span className="text-foreground font-mono truncate max-w-[60%]">{wh.url ?? "Not set"}</span>
                      </div>
                      {wh.pending_update_count !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pending</span>
                          <span className="text-foreground">{wh.pending_update_count}</span>
                        </div>
                      )}
                      {wh.last_error_message && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Error</span>
                          <span className="text-red-400">{wh.last_error_message}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <Button size="sm" variant="ghost" onClick={() => handleCheckWebhook(bot.id)}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Check webhook
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Bot */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Bot
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Bot token (from @BotFather)</label>
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Label (optional)</label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder='e.g. "BD Bot", "Marketing Bot"'
              className="text-xs"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleAddBot} disabled={adding || !newToken.trim()}>
              {adding ? "Verifying..." : "Add Bot"}
            </Button>
            {addError && <p className="text-xs text-red-400">{addError}</p>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          The token is verified with Telegram, then encrypted (AES-256-GCM) before storage. The first bot added becomes the default.
        </p>
      </div>

      {/* Webhook Setup */}
      {bots.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Webhooks</h2>
          <p className="text-xs text-muted-foreground">
            Set up webhooks for all active bots. Each bot gets its own webhook endpoint for receiving Telegram updates.
          </p>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSetupWebhooks} disabled={settingUp}>
              {settingUp ? "Configuring..." : `Set Up Webhooks (${bots.filter((b) => b.is_active).length} bot${bots.filter((b) => b.is_active).length !== 1 ? "s" : ""})`}
            </Button>
            {setupResult && (
              <p className={cn("text-xs", setupResult.startsWith("Failed") ? "text-red-400" : "text-emerald-400")}>
                {setupResult}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Setup Guide */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Setup Guide</h2>
        <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
          <li>Create bots via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@BotFather</a> — one per team (BD, Marketing, Admin)</li>
          <li>Add each bot token above — it&apos;s verified with Telegram and encrypted</li>
          <li>Click &quot;Set Up Webhooks&quot; to activate all bots</li>
          <li>Add bots as admin to Telegram groups — groups auto-register and link to that bot</li>
          <li>In the Groups page, you can reassign groups between bots</li>
        </ol>
      </div>

      {/* ── Slack Integration ── */}
      <div className="pt-6 border-t border-white/10">
        <h1 className="text-xl font-semibold text-foreground">Slack Integration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Slack to forward Telegram messages to Slack channels via workflow automations.
        </p>
      </div>

      {slackLoading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm text-muted-foreground">
          Loading Slack status...
        </div>
      ) : slackConnected ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-white/[0.035] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <Link2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Connected to Slack</p>
                <p className="text-xs text-muted-foreground">
                  Workspace: <span className="text-foreground">{slackTeam}</span>
                  {slackBotUser && <> · Bot: <span className="text-foreground">{slackBotUser}</span></>}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={handleDisconnectSlack}
            >
              <Unlink className="h-3.5 w-3.5 mr-1.5" /> Disconnect
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use the <span className="text-foreground">Send Slack Message</span> action in the Automation Builder to forward TG messages to Slack channels.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Hash className="h-4 w-4" /> Connect Slack
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Slack Bot Token</label>
              <Input
                type="password"
                value={slackToken}
                onChange={(e) => setSlackToken(e.target.value)}
                placeholder="xoxb-your-slack-bot-token"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleConnectSlack} disabled={slackAdding || !slackToken.trim()}>
                {slackAdding ? "Verifying..." : "Connect Slack"}
              </Button>
              {slackError && <p className="text-xs text-red-400">{slackError}</p>}
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] p-3 space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How to get a Slack Bot Token:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to <span className="text-primary">api.slack.com/apps</span> and create a new app</li>
              <li>Under OAuth &amp; Permissions, add scopes: <code className="text-foreground">chat:write</code>, <code className="text-foreground">channels:read</code>, <code className="text-foreground">users:read</code></li>
              <li>Install the app to your workspace (requires admin approval)</li>
              <li>Copy the <span className="text-foreground">Bot User OAuth Token</span> (starts with xoxb-)</li>
              <li>Invite the bot to channels: <code className="text-foreground">/invite @YourBot</code></li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
