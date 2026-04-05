"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Database, Shield, AlertTriangle, Check, Loader2, Trash2,
  RefreshCw, Search, Clock, HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTelegram } from "@/lib/client/telegram-context";
import { useMessageIndexSync } from "@/lib/client/telegram-message-sync";
import type { TgDialog } from "@/lib/client/telegram-service";

const RETENTION_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
];

interface IndexConfig {
  indexing_enabled: boolean;
  consent_given_at: string | null;
  indexed_chats: number[];
  exclude_chats: number[];
  retention_days: number;
  last_full_sync_at: string | null;
}

export default function MessageIndexingPage() {
  const { status: tgStatus, service } = useTelegram();
  const { progress, syncNow, indexingEnabled, messageCount, config } = useMessageIndexSync();

  const [dialogs, setDialogs] = React.useState<TgDialog[]>([]);
  const [loadingDialogs, setLoadingDialogs] = React.useState(false);
  const [enabling, setEnabling] = React.useState(false);
  const [updating, setUpdating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [showConsentFlow, setShowConsentFlow] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");
  const [selectedChats, setSelectedChats] = React.useState<Set<number>>(new Set());
  const [retentionDays, setRetentionDays] = React.useState(90);

  // Load dialogs when TG is connected
  React.useEffect(() => {
    if (tgStatus === "connected") {
      loadDialogs();
    }
  }, [tgStatus]);

  // Sync local state from config
  React.useEffect(() => {
    if (config) {
      setSelectedChats(new Set(config.indexed_chats ?? []));
      setRetentionDays(config.retention_days ?? 90);
    }
  }, [config]);

  async function loadDialogs() {
    setLoadingDialogs(true);
    try {
      const result = await service.getDialogs(200);
      setDialogs(result);
    } catch {
      // Failed to load dialogs
    } finally {
      setLoadingDialogs(false);
    }
  }

  async function enableIndexing() {
    setEnabling(true);
    try {
      const res = await fetch("/api/messages/index/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          retention_days: retentionDays,
        }),
      });
      if (res.ok) {
        toast.success("Message indexing enabled");
        setShowConsentFlow(false);
        // Reload page state
        window.location.reload();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to enable indexing");
      }
    } finally {
      setEnabling(false);
    }
  }

  async function updateConfig() {
    setUpdating(true);
    try {
      const res = await fetch("/api/messages/index/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indexed_chats: Array.from(selectedChats),
          retention_days: retentionDays,
        }),
      });
      if (res.ok) {
        toast.success("Indexing configuration updated");
      } else {
        toast.error("Failed to update configuration");
      }
    } finally {
      setUpdating(false);
    }
  }

  async function deleteAllData() {
    setDeleting(true);
    try {
      const res = await fetch("/api/messages/index/config", { method: "DELETE" });
      if (res.ok) {
        toast.success("All indexed data deleted and indexing disabled");
        setShowDeleteConfirm(false);
        setDeleteConfirmText("");
        window.location.reload();
      } else {
        toast.error("Failed to delete indexed data");
      }
    } finally {
      setDeleting(false);
    }
  }

  function toggleChat(chatId: number) {
    setSelectedChats((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  }

  // Estimate storage: ~200 bytes per encrypted message
  const storageEstimate = messageCount * 200;
  const storageLabel = storageEstimate < 1024 * 1024
    ? `${Math.round(storageEstimate / 1024)} KB`
    : `${(storageEstimate / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Message Indexing</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Opt-in server-side message indexing for search and analytics across your Telegram chats.
        </p>
      </div>

      {/* ZK Architecture Notice */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-300">Zero-Knowledge Architecture</h3>
            <p className="mt-1 text-sm text-zinc-400">
              By default, SupraCRM uses zero-knowledge Telegram sessions. Your messages are processed
              entirely in the browser via GramJS, and the server never sees message content.
              Enabling indexing is a <span className="text-zinc-200 font-medium">voluntary trade-off</span> that
              sends message data to the server for search and analytics capabilities.
            </p>
          </div>
        </div>
      </div>

      {/* Not Connected Warning */}
      {tgStatus !== "connected" && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-300">Telegram Not Connected</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Connect your Telegram account first to use message indexing.
                Go to Settings &gt; Integrations to connect.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Section (when indexing is enabled) */}
      {indexingEnabled && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-400" />
              Indexing Active
            </h2>
            <div className="flex items-center gap-2">
              {progress.isSyncing && (
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing {progress.currentChat ? `chat ${progress.currentChat}` : "..."}
                  {progress.syncedCount > 0 && ` (${progress.syncedCount} new)`}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={syncNow}
                disabled={progress.isSyncing || tgStatus !== "connected"}
              >
                <RefreshCw className={cn("h-4 w-4 mr-1", progress.isSyncing && "animate-spin")} />
                Sync Now
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-500 flex items-center gap-1">
                <Search className="h-3 w-3" /> Messages Indexed
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {messageCount.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-500 flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> Storage Estimate
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{storageLabel}</div>
            </div>
            <div className="rounded-md bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Retention
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{retentionDays} days</div>
            </div>
            <div className="rounded-md bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Last Sync
              </div>
              <div className="mt-1 text-sm font-medium text-zinc-100">
                {progress.lastSyncAt
                  ? new Date(progress.lastSyncAt).toLocaleTimeString()
                  : config?.last_full_sync_at
                    ? new Date(config.last_full_sync_at).toLocaleTimeString()
                    : "Never"}
              </div>
            </div>
          </div>

          {progress.error && (
            <div className="text-sm text-red-400 bg-red-500/10 rounded px-3 py-2">
              {progress.error}
            </div>
          )}
        </div>
      )}

      {/* Consent Flow (when not enabled) */}
      {!indexingEnabled && !showConsentFlow && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          <Database className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-zinc-200">Message Indexing is Disabled</h2>
          <p className="mt-2 text-sm text-zinc-400 max-w-lg mx-auto">
            Enable server-side indexing to search across all your Telegram messages,
            view analytics, and get AI-powered insights. Your messages will be encrypted
            at rest on the server.
          </p>
          <Button
            className="mt-4"
            onClick={() => setShowConsentFlow(true)}
            disabled={tgStatus !== "connected"}
          >
            Enable Message Indexing
          </Button>
        </div>
      )}

      {/* Consent Dialog */}
      {showConsentFlow && !indexingEnabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-medium text-amber-200">Privacy Trade-off</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Please read carefully before enabling:
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-zinc-300 ml-9">
            <div className="flex gap-2">
              <span className="text-amber-400 font-bold shrink-0">1.</span>
              <span>
                <strong className="text-zinc-100">What changes:</strong> Messages from selected Telegram chats
                will be sent to the server and stored in an encrypted database. The server will be able to
                decrypt these messages for search and analytics.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-400 font-bold shrink-0">2.</span>
              <span>
                <strong className="text-zinc-100">What is stored:</strong> Message text (encrypted with AES-256-GCM),
                sender info, timestamps, and message metadata. Media files are NOT stored.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-400 font-bold shrink-0">3.</span>
              <span>
                <strong className="text-zinc-100">Retention:</strong> Messages are auto-deleted after your chosen
                retention period. You can delete all data at any time.
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-400 font-bold shrink-0">4.</span>
              <span>
                <strong className="text-zinc-100">Reversible:</strong> You can disable indexing and delete all
                server-side data at any time. This will not affect your Telegram messages.
              </span>
            </div>
          </div>

          {/* Retention Selection */}
          <div className="ml-9">
            <label className="text-sm font-medium text-zinc-300 block mb-2">
              Data retention period:
            </label>
            <div className="flex flex-wrap gap-2">
              {RETENTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRetentionDays(opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md border transition-colors",
                    retentionDays === opt.value
                      ? "border-amber-500 bg-amber-500/10 text-amber-200"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 ml-9 pt-2">
            <Button
              onClick={enableIndexing}
              disabled={enabling}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {enabling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              I Understand — Enable Indexing
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowConsentFlow(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Chat Selector (when enabled) */}
      {indexingEnabled && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-zinc-100">Chats to Index</h2>
              <p className="text-sm text-zinc-400 mt-0.5">
                {selectedChats.size === 0
                  ? "All chats will be indexed (no filter applied)"
                  : `${selectedChats.size} chat${selectedChats.size !== 1 ? "s" : ""} selected`}
              </p>
            </div>
            <Button
              size="sm"
              onClick={updateConfig}
              disabled={updating}
            >
              {updating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>

          {loadingDialogs ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading chats from Telegram...
            </div>
          ) : dialogs.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">
              {tgStatus !== "connected"
                ? "Connect Telegram to see your chats."
                : "No chats found."}
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1 rounded-md border border-zinc-800 p-2">
              <button
                onClick={() => setSelectedChats(new Set())}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors",
                  selectedChats.size === 0
                    ? "bg-zinc-700/50 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50"
                )}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                  selectedChats.size === 0
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-zinc-600"
                )}>
                  {selectedChats.size === 0 && <Check className="h-3 w-3 text-white" />}
                </div>
                All chats (no filter)
              </button>

              {dialogs.map((dialog) => {
                const isSelected = selectedChats.has(dialog.telegramId);
                return (
                  <button
                    key={dialog.id}
                    onClick={() => toggleChat(dialog.telegramId)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors",
                      isSelected
                        ? "bg-zinc-700/50 text-zinc-100"
                        : "text-zinc-400 hover:bg-zinc-800/50"
                    )}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      isSelected
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-zinc-600"
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span className="truncate">{dialog.title}</span>
                    <span className="ml-auto text-xs text-zinc-600 shrink-0">{dialog.type}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Retention Slider */}
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-2">
              Retention period
            </label>
            <div className="flex flex-wrap gap-2">
              {RETENTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRetentionDays(opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md border transition-colors",
                    retentionDays === opt.value
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      {indexingEnabled && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 space-y-4">
          <h2 className="text-lg font-medium text-red-300 flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </h2>
          <p className="text-sm text-zinc-400">
            Disable message indexing and permanently delete all indexed messages from the server.
            This action cannot be undone. Your Telegram messages are not affected.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Indexed Data
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-300 font-medium">
                Type &quot;DELETE ALL&quot; to confirm permanent deletion of {messageCount.toLocaleString()} indexed messages:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE ALL"
                className="w-full rounded-md border border-red-500/30 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <div className="flex gap-3">
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={deleteAllData}
                  disabled={deleteConfirmText !== "DELETE ALL" || deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Permanently Delete Everything
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
