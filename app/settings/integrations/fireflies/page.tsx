"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Mic, Loader2, Copy, Check, Eye, EyeOff } from "lucide-react";

interface FirefliesConnectionData {
  id: string;
  email: string;
  is_active: boolean;
  connected_at: string;
  webhook_url: string;
  webhook_secret: string;
}

export default function FirefliesSettingsPage() {
  const [connection, setConnection] = React.useState<FirefliesConnectionData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [copied, setCopied] = React.useState<"url" | "secret" | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    fetchConnection();
  }, []);

  async function fetchConnection() {
    try {
      const res = await fetch("/api/fireflies/connection");
      if (res.ok) {
        const { data } = await res.json();
        setConnection(data);
      }
    } catch {
      // No connection
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!apiKey.trim()) {
      setStatusMessage({ type: "error", message: "Please enter your Fireflies API key" });
      return;
    }
    setConnecting(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/fireflies/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: "error", message: data.error || "Connection failed" });
        return;
      }
      setStatusMessage({
        type: "success",
        message: `Connected as ${data.data.email}. Now set up the webhook below.`,
      });
      setApiKey("");
      fetchConnection();
    } catch {
      setStatusMessage({ type: "error", message: "Connection failed" });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Fireflies? Transcript syncing will stop.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/fireflies/connection", { method: "DELETE" });
      if (res.ok) {
        setConnection(null);
        setStatusMessage({ type: "success", message: "Fireflies disconnected." });
      } else {
        const data = await res.json();
        setStatusMessage({ type: "error", message: data.error || "Disconnect failed" });
      }
    } catch {
      setStatusMessage({ type: "error", message: "Disconnect failed" });
    } finally {
      setDisconnecting(false);
    }
  }

  function copyToClipboard(text: string, key: "url" | "secret") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings/integrations"
          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
            <Mic className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Fireflies.ai</h1>
            <p className="text-xs text-muted-foreground">
              Auto-transcribe meetings, enrich deals with summaries and action items
            </p>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={
            statusMessage.type === "success"
              ? "rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-400"
              : "rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400"
          }
        >
          {statusMessage.message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking connection...
        </div>
      ) : connection ? (
        <div className="space-y-4">
          {/* Connection status */}
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Connected</p>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    Active
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{connection.email}</p>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>

          {/* Webhook setup */}
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
            <h3 className="text-sm font-medium text-foreground">Webhook Setup</h3>
            <p className="text-xs text-muted-foreground">
              Add this webhook URL in your Fireflies.ai dashboard under Integrations &rarr; Webhooks.
            </p>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Webhook URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-foreground font-mono truncate">
                  {connection.webhook_url}
                </code>
                <button
                  onClick={() => copyToClipboard(connection.webhook_url, "url")}
                  className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  {copied === "url" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {connection.webhook_secret && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Webhook Secret (for signature verification)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-foreground font-mono truncate">
                    {showKey ? connection.webhook_secret : "••••••••••••••••"}
                  </code>
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(connection.webhook_secret, "secret")}
                    className="rounded-lg border border-white/10 p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    {copied === "secret" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3 space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Setup Steps</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Go to <span className="text-foreground">app.fireflies.ai/integrations</span></li>
                <li>Find <span className="text-foreground">Webhooks</span> and click Configure</li>
                <li>Paste the webhook URL above</li>
                <li>Select <span className="text-foreground">Transcription complete</span> event</li>
                <li>Save the webhook</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Connect your Fireflies.ai account to auto-transcribe meetings and enrich
            deal timelines with summaries, action items, and sentiment.
          </p>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Fireflies API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-purple-500/50 font-mono pr-10"
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Find your API key at <span className="text-foreground">app.fireflies.ai/integrations/custom</span>
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting || !apiKey.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600/90 transition-colors disabled:opacity-50"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              "Connect Fireflies"
            )}
          </button>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">How it works</h3>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-purple-400 mt-0.5">1.</span>
            Connect your Fireflies account with an API key
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-400 mt-0.5">2.</span>
            Set up the webhook to receive transcription notifications
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-400 mt-0.5">3.</span>
            After each meeting, Fireflies sends the transcript to SupraCRM
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-400 mt-0.5">4.</span>
            Transcripts are matched to deals via booking links or attendee emails
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-400 mt-0.5">5.</span>
            Summary, action items, and sentiment appear in the deal timeline
          </li>
        </ul>
      </div>
    </div>
  );
}
