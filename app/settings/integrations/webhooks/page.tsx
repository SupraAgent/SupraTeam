"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, Globe, Check, X, Zap, ZapOff, Eye, EyeOff,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type DeliveryStats = { total: number; success: number; lastDelivery: string | null };

type Webhook = {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  headers: Record<string, string>;
  last_triggered_at: string | null;
  last_status: number | null;
  failure_count: number;
  delivery_stats: DeliveryStats;
  created_at: string;
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = React.useState<Webhook[]>([]);
  const [validEvents, setValidEvents] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);

  // Create form
  const [newName, setNewName] = React.useState("");
  const [newUrl, setNewUrl] = React.useState("");
  const [newSecret, setNewSecret] = React.useState("");
  const [newEvents, setNewEvents] = React.useState<Set<string>>(new Set());
  const [showSecret, setShowSecret] = React.useState(false);

  React.useEffect(() => {
    fetchWebhooks();
  }, []);

  async function fetchWebhooks() {
    try {
      const res = await fetch("/api/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks ?? []);
        setValidEvents(data.validEvents ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !newUrl.trim() || newEvents.size === 0) return;

    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        url: newUrl.trim(),
        secret: newSecret || undefined,
        events: [...newEvents],
      }),
    });

    if (res.ok) {
      toast.success("Webhook created");
      setShowCreate(false);
      setNewName("");
      setNewUrl("");
      setNewSecret("");
      setNewEvents(new Set());
      fetchWebhooks();
    }
  }

  async function toggleWebhook(id: string, isActive: boolean) {
    await fetch("/api/webhooks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, is_active: !isActive, failure_count: 0 } : w)));
  }

  async function deleteWebhook(id: string) {
    await fetch("/api/webhooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    toast.success("Webhook deleted");
  }

  function toggleEvent(event: string) {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
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
          <h1 className="text-xl font-semibold text-foreground">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send CRM events to external services. Compatible with Zapier, Make, n8n, and custom endpoints.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Webhook
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">New Webhook Endpoint</h3>

          <div className="grid grid-cols-2 gap-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (e.g. HubSpot Sync)" className="text-sm" />
            <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://hooks.zapier.com/..." className="text-sm font-mono" />
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="HMAC secret (optional)"
              className="text-xs font-mono flex-1"
              type={showSecret ? "text" : "password"}
            />
            <button onClick={() => setShowSecret(!showSecret)} className="text-muted-foreground hover:text-foreground">
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Events to subscribe</label>
            <div className="flex flex-wrap gap-1.5">
              {validEvents.map((event) => (
                <button
                  key={event}
                  onClick={() => toggleEvent(event)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[10px] font-mono transition-colors",
                    newEvents.has(event) ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-muted-foreground border border-white/10"
                  )}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || !newUrl.trim() || newEvents.size === 0}>
              Create Webhook
            </Button>
          </div>
        </div>
      )}

      {/* Webhooks list */}
      <div className="space-y-2">
        {webhooks.map((webhook) => {
          const stats = webhook.delivery_stats;
          const deliveryRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : null;

          return (
            <div
              key={webhook.id}
              className={cn(
                "rounded-xl border bg-white/[0.035] px-4 py-3 transition-colors",
                webhook.is_active ? "border-white/10" : "border-white/5 opacity-50"
              )}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleWebhook(webhook.id, webhook.is_active)}
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    webhook.is_active ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
                  )}
                >
                  {webhook.is_active ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{webhook.name}</p>
                    {webhook.failure_count > 0 && (
                      <span className="rounded bg-red-500/20 text-red-400 px-1.5 py-0.5 text-[9px]">
                        {webhook.failure_count} failures
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{webhook.url}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {webhook.events.map((e) => (
                      <span key={e} className="rounded bg-white/5 px-1 py-0.5 text-[8px] font-mono text-muted-foreground">{e}</span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {deliveryRate !== null && (
                    <p className={cn("text-xs font-medium", deliveryRate >= 90 ? "text-emerald-400" : deliveryRate >= 70 ? "text-amber-400" : "text-red-400")}>
                      {deliveryRate}% delivery
                    </p>
                  )}
                  <p className="text-[9px] text-muted-foreground">
                    {stats.total} deliveries
                    {stats.lastDelivery && <> · Last {timeAgo(stats.lastDelivery)}</>}
                  </p>
                </div>

                <button onClick={() => deleteWebhook(webhook.id)} className="text-muted-foreground hover:text-red-400 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {webhooks.length === 0 && !showCreate && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <Globe className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              No webhooks configured. Create one to sync CRM events with external services.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
