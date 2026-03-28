"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Key, Copy, Check, AlertTriangle } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
  expires_at: string | null;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = React.useState<ApiKey[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newScopes, setNewScopes] = React.useState<Set<string>>(new Set(["read"]));
  const [newExpiry, setNewExpiry] = React.useState("");
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;

    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        scopes: [...newScopes],
        expires_days: newExpiry ? Number(newExpiry) : undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setRevealedKey(data.raw_key);
      setShowCreate(false);
      setNewName("");
      setNewScopes(new Set(["read"]));
      setNewExpiry("");
      fetchKeys();
    } else {
      toast.error("Failed to create API key");
    }
  }

  async function deleteKey(id: string) {
    await fetch("/api/api-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setKeys((prev) => prev.filter((k) => k.id !== id));
    toast.success("API key revoked");
  }

  function copyKey() {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleScope(scope: string) {
    setNewScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">API Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate keys for the public REST API. Keys are hashed and cannot be retrieved after creation.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Key
        </Button>
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            Copy this key now — it won&apos;t be shown again
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-mono text-foreground break-all select-all">
              {revealedKey}
            </code>
            <Button size="sm" variant="ghost" onClick={copyKey}>
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">New API Key</h3>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Key name (e.g. Zapier Integration)"
            className="text-sm"
          />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Scopes</label>
            <div className="flex gap-2">
              {["read", "write", "admin"].map((scope) => (
                <button
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-medium transition-colors capitalize",
                    newScopes.has(scope)
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-white/5 text-muted-foreground border border-white/10"
                  )}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>

          <Input
            value={newExpiry}
            onChange={(e) => setNewExpiry(e.target.value)}
            placeholder="Expires in days (optional, e.g. 90)"
            type="number"
            className="text-sm"
          />

          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || newScopes.size === 0}>
              Generate Key
            </Button>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="space-y-2">
        {keys.map((key) => (
          <div
            key={key.id}
            className={cn(
              "rounded-xl border bg-white/[0.035] px-4 py-3 transition-colors",
              key.is_active ? "border-white/10" : "border-white/5 opacity-50"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <Key className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">{key.key_prefix}...</span>
                  {key.scopes.map((s) => (
                    <span key={s} className="rounded bg-white/5 px-1 py-0.5 text-[8px] font-mono text-muted-foreground capitalize">{s}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-muted-foreground">
                  {key.request_count} requests
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {key.last_used_at ? `Last used ${timeAgo(key.last_used_at)}` : "Never used"}
                </p>
                {key.expires_at && (
                  <p className="text-[9px] text-amber-400">
                    Expires {new Date(key.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteKey(key.id)}
                className="text-muted-foreground hover:text-red-400 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {keys.length === 0 && !showCreate && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Key className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              No API keys yet. Generate one to access the CRM via REST API.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
