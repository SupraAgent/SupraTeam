"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Copy, Trash2, QrCode, Link2, BarChart3, Check } from "lucide-react";
import { toast } from "sonner";

interface PipelineStage {
  id: string;
  name: string;
}

interface QrCode {
  id: string;
  short_code: string;
  name: string;
  stage_id: string;
  board_type: string;
  scan_count: number;
  lead_count: number;
  created_at: string;
  stage: PipelineStage | null;
}

const BOARD_TYPES = ["BD", "Marketing", "Admin", "Applications"] as const;

export default function QrCodesPage() {
  const [qrCodes, setQrCodes] = React.useState<QrCode[]>([]);
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [botUsername, setBotUsername] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Create form state
  const [showCreate, setShowCreate] = React.useState(false);
  const [name, setName] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [boardType, setBoardType] = React.useState<string>("BD");
  const [creating, setCreating] = React.useState(false);

  // Track which link was just copied
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [qrRes, stageRes, botRes] = await Promise.all([
        fetch("/api/qr-codes").then((r) => r.json()),
        fetch("/api/pipeline/stages").then((r) => r.json()),
        fetch("/api/bots").then((r) => r.json()),
      ]);
      setQrCodes(qrRes.data ?? []);
      setStages(stageRes.data ?? stageRes.stages ?? []);

      // Pick the default bot's username
      const bots = botRes.data ?? [];
      const defaultBot = bots.find((b: Record<string, unknown>) => b.is_default) ?? bots[0];
      if (defaultBot?.bot_username) {
        setBotUsername(defaultBot.bot_username);
      }
    } catch (err) {
      console.error("[qr-codes] fetch error:", err);
      toast.error("Failed to load QR codes");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set default stage when stages load
  React.useEffect(() => {
    if (stages.length > 0 && !stageId) {
      setStageId(stages[0].id);
    }
  }, [stages, stageId]);

  const getDeepLink = (shortCode: string) => {
    if (!botUsername) return `https://t.me/YOUR_BOT?start=qr_${shortCode}`;
    return `https://t.me/${botUsername}?start=qr_${shortCode}`;
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!stageId) {
      toast.error("Select a pipeline stage");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), stage_id: stageId, board_type: boardType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create QR code");
        return;
      }
      setQrCodes((prev) => [data.data, ...prev]);
      setName("");
      setShowCreate(false);
      toast.success("QR code created");
    } catch {
      toast.error("Failed to create QR code");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/qr-codes?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete QR code");
        return;
      }
      setQrCodes((prev) => prev.filter((q) => q.id !== id));
      toast.success("QR code deleted");
    } catch {
      toast.error("Failed to delete QR code");
    }
  };

  const handleCopy = async (shortCode: string, id: string) => {
    const link = getDeepLink(shortCode);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      toast.success("Deep link copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">QR Code Campaigns</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Create Telegram deep links for lead capture. Print QR codes from these links to capture leads at events.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} variant="default">
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-4">
          <h2 className="text-sm font-medium text-zinc-300">New QR Code Campaign</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Campaign Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ETH Denver 2026"
                className="bg-zinc-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Pipeline Stage</label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Board</label>
              <select
                value={boardType}
                onChange={(e) => setBoardType(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {BOARD_TYPES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bot username warning */}
      {!botUsername && (
        <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
          No bot configured. Deep links will use a placeholder username. Add a bot in Settings &gt; Integrations to generate working links.
        </div>
      )}

      {/* QR codes list */}
      {qrCodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 py-16">
          <QrCode className="mb-4 h-12 w-12 text-zinc-600" />
          <p className="text-sm text-zinc-400">No QR code campaigns yet</p>
          <p className="mt-1 text-xs text-zinc-500">Create your first campaign to start capturing leads</p>
        </div>
      ) : (
        <div className="space-y-3">
          {qrCodes.map((qr) => (
            <div
              key={qr.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-medium text-white">{qr.name}</h3>
                  <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    {qr.board_type}
                  </span>
                  {qr.stage && (
                    <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {qr.stage.name}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    <code className="select-all text-zinc-400">{getDeepLink(qr.short_code)}</code>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" />
                    {qr.scan_count} scan{qr.scan_count !== 1 ? "s" : ""}
                  </span>
                  <span>
                    {qr.lead_count} lead{qr.lead_count !== 1 ? "s" : ""}
                  </span>
                  <span className="text-zinc-600">
                    Created {new Date(qr.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(qr.short_code, qr.id)}
                  title="Copy deep link"
                >
                  {copiedId === qr.id ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(qr.id)}
                  title="Delete"
                  className="text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage instructions */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300">How it works</h3>
        <ol className="mt-2 space-y-1 text-xs text-zinc-500 list-decimal list-inside">
          <li>Create a campaign with a target pipeline stage and board</li>
          <li>Copy the generated deep link</li>
          <li>Generate a QR code from the link using any QR code generator</li>
          <li>When someone scans the QR code, they open your Telegram bot</li>
          <li>The bot creates a contact and deal in your configured pipeline stage</li>
        </ol>
      </div>
    </div>
  );
}
