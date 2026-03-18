"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Check, X, RefreshCw, Save } from "lucide-react";

type WebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
};

type BotInfo = {
  ok: boolean;
  result?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
  };
};

type TokenInfo = {
  exists: boolean;
  masked?: string;
};

export default function TelegramSettingsPage() {
  const [webhookInfo, setWebhookInfo] = React.useState<WebhookInfo | null>(null);
  const [botInfo, setBotInfo] = React.useState<BotInfo | null>(null);
  const [tokenInfo, setTokenInfo] = React.useState<TokenInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [setting, setSetting] = React.useState(false);
  const [newToken, setNewToken] = React.useState("");
  const [savingToken, setSavingToken] = React.useState(false);
  const [tokenMsg, setTokenMsg] = React.useState("");

  async function fetchStatus() {
    setLoading(true);
    try {
      const [webhookRes, statusRes, tokenRes] = await Promise.all([
        fetch("/api/bot/setup").then((r) => r.json()).catch(() => null),
        fetch("/api/bot/status").then((r) => r.json()).catch(() => null),
        fetch("/api/tokens?provider=telegram_bot").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (webhookRes) setWebhookInfo(webhookRes);
      if (statusRes) setBotInfo(statusRes);
      if (tokenRes?.data) {
        setTokenInfo({ exists: true, masked: tokenRes.data.masked });
      } else {
        setTokenInfo({ exists: false });
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchStatus(); }, []);

  async function handleSetWebhook() {
    setSetting(true);
    try {
      const res = await fetch("/api/bot/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } finally {
      setSetting(false);
    }
  }

  async function handleSaveToken() {
    if (!newToken.trim()) return;
    setSavingToken(true);
    setTokenMsg("");
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "telegram_bot", token: newToken.trim() }),
      });
      if (res.ok) {
        setTokenMsg("Token saved. Restart the bot to apply.");
        setNewToken("");
        setTokenInfo({ exists: true, masked: "••••" + newToken.slice(-4) });
      } else {
        const err = await res.json().catch(() => ({}));
        setTokenMsg(err.error ?? "Failed to save token");
      }
    } finally {
      setSavingToken(false);
      setTimeout(() => setTokenMsg(""), 5000);
    }
  }

  const isConnected = webhookInfo?.url && webhookInfo.url.includes("crm.supravibe.xyz");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Telegram Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your Telegram bot connection, webhook, and group integrations.
        </p>
      </div>

      {/* Bot status */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2AABEE]/10">
              <MessageCircle className="h-5 w-5 text-[#2AABEE]" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {botInfo?.result ? `@${botInfo.result.username}` : "Telegram Bot"}
              </p>
              <p className="text-xs text-muted-foreground">
                {botInfo?.result ? botInfo.result.first_name : "Checking status..."}
              </p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isConnected ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            {isConnected ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {isConnected ? "Connected" : "Not connected"}
          </span>
        </div>

        {/* Webhook info */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Webhook URL</span>
            <span className="text-foreground font-mono">{webhookInfo?.url || "--"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pending updates</span>
            <span className="text-foreground">{webhookInfo?.pending_update_count ?? "--"}</span>
          </div>
          {webhookInfo?.last_error_message && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last error</span>
              <span className="text-red-400">{webhookInfo.last_error_message}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSetWebhook} disabled={setting}>
            {setting ? "Setting up..." : isConnected ? "Reconnect Webhook" : "Connect Webhook"}
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Bot Token Management */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
        <h2 className="text-sm font-medium text-foreground">Bot Token</h2>

        {tokenInfo?.exists && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground">Stored token</p>
              <p className="text-xs text-muted-foreground font-mono">{tokenInfo.masked}</p>
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
              Encrypted
            </span>
          </div>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            {tokenInfo?.exists ? "Replace bot token" : "Add bot token"}
          </label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              className="flex-1 font-mono text-xs"
            />
            <Button size="sm" onClick={handleSaveToken} disabled={savingToken || !newToken.trim()}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {savingToken ? "Saving..." : "Save"}
            </Button>
          </div>
          {tokenMsg && (
            <p className="mt-2 text-xs text-primary">{tokenMsg}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Get a bot token from{" "}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            @BotFather
          </a>
          . Tokens are encrypted with AES-256-GCM before storage.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Setup Guide</h2>
        <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
          <li>Add <span className="text-foreground font-mono">@SupraAdmin_bot</span> to a Telegram group as admin</li>
          <li>The bot will auto-register the group in the CRM</li>
          <li>Create a deal and paste the group&apos;s TG link in the deal detail panel</li>
          <li>Messages in that group will appear as notifications in the CRM</li>
          <li>Stage changes on deals will be sent to the linked TG group</li>
        </ol>
      </div>
    </div>
  );
}
