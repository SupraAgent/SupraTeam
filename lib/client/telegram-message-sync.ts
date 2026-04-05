"use client";

import * as React from "react";
import { useTelegram } from "./telegram-context";
import { useAuth } from "@/lib/auth";
import type { TgDialog, TgMessage } from "./telegram-service";

interface SyncWatermark {
  chatId: number;
  lastMessageId: number;
}

interface SyncProgress {
  /** Whether a sync cycle is currently running. */
  isSyncing: boolean;
  /** Total messages synced in the current cycle. */
  syncedCount: number;
  /** Chat currently being synced. */
  currentChat: number | null;
  /** Last successful sync time. */
  lastSyncAt: string | null;
  /** Error from the last sync attempt. */
  error: string | null;
}

interface IndexConfig {
  indexing_enabled: boolean;
  indexed_chats: number[];
  exclude_chats: number[];
  retention_days: number;
  last_full_sync_at: string | null;
}

interface MessageIndexSyncResult {
  progress: SyncProgress;
  /** Trigger an immediate sync cycle. */
  syncNow: () => void;
  /** Whether indexing is enabled. */
  indexingEnabled: boolean;
  /** Indexed message count from server. */
  messageCount: number;
  /** The resolved config. */
  config: IndexConfig | null;
}

const BATCH_SIZE = 100;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WATERMARK_STORAGE_KEY = "suprateam-msg-sync-watermarks";

function loadWatermarks(userId: string): Map<number, number> {
  try {
    const raw = localStorage.getItem(`${WATERMARK_STORAGE_KEY}-${userId}`);
    if (!raw) return new Map();
    const parsed: SyncWatermark[] = JSON.parse(raw);
    return new Map(parsed.map((w) => [w.chatId, w.lastMessageId]));
  } catch {
    return new Map();
  }
}

function saveWatermarks(userId: string, watermarks: Map<number, number>): void {
  const arr: SyncWatermark[] = Array.from(watermarks.entries()).map(([chatId, lastMessageId]) => ({
    chatId,
    lastMessageId,
  }));
  localStorage.setItem(`${WATERMARK_STORAGE_KEY}-${userId}`, JSON.stringify(arr));
}

/**
 * Hook that manages periodic sync of Telegram messages to the server-side index.
 *
 * Only active when:
 *   1. User has Telegram connected (GramJS status = "connected")
 *   2. User has opted into message indexing
 *
 * Messages are fetched from GramJS client-side, batched, and POSTed to
 * /api/messages/index. The server encrypts them before storage.
 */
export function useMessageIndexSync(): MessageIndexSyncResult {
  const { status: tgStatus, service } = useTelegram();
  const { user } = useAuth();

  const [config, setConfig] = React.useState<IndexConfig | null>(null);
  const [messageCount, setMessageCount] = React.useState(0);
  const [progress, setProgress] = React.useState<SyncProgress>({
    isSyncing: false,
    syncedCount: 0,
    currentChat: null,
    lastSyncAt: null,
    error: null,
  });

  const syncingRef = React.useRef(false);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch indexing config on mount and when user changes
  React.useEffect(() => {
    if (!user?.id) return;
    fetchConfig();
  }, [user?.id]);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/messages/index/config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.data);
        setMessageCount(data.message_count ?? 0);
      }
    } catch {
      // Config fetch failed silently — indexing stays disabled
    }
  }

  // Set up periodic sync when conditions are met
  React.useEffect(() => {
    if (!config?.indexing_enabled || tgStatus !== "connected" || !user?.id) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Run initial sync after a short delay
    const initialTimer = setTimeout(() => {
      runSyncCycle();
    }, 3000);

    // Schedule periodic sync
    intervalRef.current = setInterval(() => {
      runSyncCycle();
    }, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // Only re-run when indexing or connection status changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.indexing_enabled, tgStatus, user?.id]);

  async function runSyncCycle() {
    if (syncingRef.current || !user?.id || tgStatus !== "connected") return;
    syncingRef.current = true;

    setProgress((p) => ({ ...p, isSyncing: true, syncedCount: 0, error: null }));

    const watermarks = loadWatermarks(user.id);
    let totalSynced = 0;

    try {
      // Get dialogs from GramJS to know which chats to sync
      const dialogs = await service.getDialogs();
      const indexedChats = config?.indexed_chats ?? [];
      const excludeChats = config?.exclude_chats ?? [];

      // Filter dialogs based on config
      const chatsToSync = dialogs.filter((d) => {
        const chatId = d.telegramId;
        if (excludeChats.includes(chatId)) return false;
        if (indexedChats.length > 0 && !indexedChats.includes(chatId)) return false;
        return true;
      });

      for (const dialog of chatsToSync) {
        const chatId = dialog.telegramId;
        setProgress((p) => ({ ...p, currentChat: chatId }));

        const lastSyncedId = watermarks.get(chatId) ?? 0;

        try {
          // Map dialog type to GramJS peer type
          const peerType = mapDialogType(dialog);

          // Fetch messages using getMessagesPage with offset from watermark
          const { messages } = await service.getMessagesPage(
            peerType,
            chatId,
            dialog.accessHash,
            BATCH_SIZE,
            lastSyncedId
          );

          if (!messages || messages.length === 0) continue;

          // Transform TgMessage to index format
          const batch = messages.map((msg: TgMessage) => ({
            chat_id: chatId,
            message_id: msg.id,
            sender_id: msg.senderId ?? null,
            sender_name: msg.senderName ?? null,
            message_text: msg.text ?? null,
            message_type: msg.mediaType ?? "text",
            has_media: Boolean(msg.mediaType),
            reply_to_message_id: msg.replyToId ?? null,
            sent_at: new Date(msg.date * 1000).toISOString(),
          }));

          // Send batch to server
          const res = await fetch("/api/messages/index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: batch }),
          });

          if (res.ok) {
            const result = await res.json();
            totalSynced += result.data?.inserted ?? 0;
            setProgress((p) => ({ ...p, syncedCount: totalSynced }));

            // Update watermark to highest message_id in this batch
            const maxId = Math.max(...messages.map((m: TgMessage) => m.id));
            watermarks.set(chatId, Math.max(lastSyncedId, maxId));
            saveWatermarks(user.id, watermarks);
          }
        } catch {
          // Individual chat sync failure — continue with other chats
        }
      }

      const now = new Date().toISOString();
      setProgress((p) => ({
        ...p,
        isSyncing: false,
        currentChat: null,
        lastSyncAt: now,
      }));

      // Refresh message count
      await fetchConfig();
    } catch (err) {
      setProgress((p) => ({
        ...p,
        isSyncing: false,
        currentChat: null,
        error: err instanceof Error ? err.message : "Sync failed",
      }));
    } finally {
      syncingRef.current = false;
    }
  }

  const syncNow = React.useCallback(() => {
    runSyncCycle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, tgStatus, user?.id]);

  return {
    progress,
    syncNow,
    indexingEnabled: config?.indexing_enabled ?? false,
    messageCount,
    config,
  };
}

/** Map TgDialog type to GramJS peer type for API calls. */
function mapDialogType(dialog: TgDialog): "user" | "chat" | "channel" {
  switch (dialog.type) {
    case "private":
      return "user";
    case "group":
      return "chat";
    case "supergroup":
    case "channel":
      return "channel";
    default:
      return "chat";
  }
}
