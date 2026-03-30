"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Eye, EyeOff, Trash2, Shield, Check } from "lucide-react";
import { toast } from "sonner";

interface AnthropicToken {
  id: string;
  masked: string;
  created_at: string;
  updated_at: string;
}

export default function AiIntegrationPage() {
  const [token, setToken] = React.useState<AnthropicToken | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [newKey, setNewKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetchToken();
  }, []);

  async function fetchToken() {
    try {
      const res = await fetch("/api/tokens?provider=anthropic");
      if (res.ok) {
        const { data } = await res.json();
        setToken(data ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!newKey.trim()) return;

    // Client-side format check
    if (!/^sk-ant-[a-zA-Z0-9_-]{20,}$/.test(newKey.trim())) {
      toast.error("Invalid key format. Anthropic keys start with sk-ant- followed by 20+ characters.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "anthropic", token: newKey.trim() }),
      });

      if (res.ok) {
        toast.success("Anthropic API key saved");
        setNewKey("");
        setShowKey(false);
        fetchToken();
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to save" }));
        toast.error(err.error || "Failed to save key");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Remove your Anthropic API key? AI features will fall back to the system key or be disabled.")) return;
    const res = await fetch("/api/tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "anthropic" }),
    });

    if (res.ok) {
      toast.success("API key removed");
      setToken(null);
    } else {
      toast.error("Failed to remove key");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
            <Brain className="h-5 w-5 text-orange-400" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">AI (Claude)</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Connect your Anthropic API key to power AI features across SupraCRM — deal summaries, sentiment analysis, chat assistant, workflow AI nodes, and more.
        </p>
      </div>

      {/* Security info */}
      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Shield className="h-4 w-4 text-emerald-400" />
          Security
        </div>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>Encrypted at rest with AES-256-GCM — same encryption used for all stored credentials</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>Server-side only — your key is never sent to the browser or exposed in client code</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>Per-user isolation — each team member can use their own key</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>Rate-limited — AI endpoints enforce per-user rate limits to prevent abuse</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>Prompt injection hardened — external content (TG messages, emails) is sanitized and XML-tagged before reaching the model</span>
          </li>
        </ul>
      </div>

      {/* Current status */}
      {token ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Key configured</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-mono">{token.masked}</span>
                {token.updated_at && (
                  <span className="ml-2">
                    Updated {new Date(token.updated_at).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-center">
          <Brain className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            No API key configured. AI features will use the system key if available, or be disabled.
          </p>
        </div>
      )}

      {/* Add/replace key form */}
      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">
          {token ? "Replace API Key" : "Add API Key"}
        </h3>
        <p className="text-xs text-muted-foreground">
          Get your key from{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            console.anthropic.com/settings/keys
          </a>
        </p>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="pr-10 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!newKey.trim() || saving}
          >
            {saving ? "Saving..." : "Save Key"}
          </Button>
        </div>
      </div>

      {/* What uses this */}
      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-2">
        <h3 className="text-sm font-medium text-foreground">Powered by your key</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            "Deal summaries",
            "Sentiment analysis",
            "AI chat assistant",
            "Pipeline insights",
            "Suggested replies",
            "Email AI (draft, summarize, tone)",
            "Highlight triage",
            "Workflow AI nodes",
            "Outreach recommendations",
            "Contact intelligence",
          ].map((feature) => (
            <div
              key={feature}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
