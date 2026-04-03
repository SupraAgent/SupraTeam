/**
 * React context for the zero-knowledge Telegram client.
 *
 * Manages the GramJS lifecycle entirely in the browser:
 *   mount → load encrypted session → decrypt → connect GramJS → ready
 *
 * All child components use useTelegram() to access the client state & service.
 */

"use client";

import * as React from "react";
import { TelegramBrowserService } from "./telegram-service";
import { loadSession, saveSession, clearSession } from "./telegram-session-store";
import { getOrCreateEncryptionKey, setEncryptionUserId } from "./telegram-crypto";
import { useAuth } from "@/lib/auth";
import type { Api } from "telegram";

type TgStatus = "loading" | "disconnected" | "connecting" | "connected" | "needs-reauth" | "error" | "reconnecting";

/** Nonce for authenticating BroadcastChannel messages from this tab. */
const CHANNEL_NONCE = crypto.getRandomValues(new Uint8Array(16)).reduce(
  (s, b) => s + b.toString(16).padStart(2, "0"), ""
);

/** Exponential backoff delays in ms: 2s, 4s, 8s, 16s, 30s cap */
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

interface TelegramContextValue {
  status: TgStatus;
  error: string | null;
  phoneLast4: string | null;
  telegramUserId: number | null;
  service: TelegramBrowserService;

  /** Connect with phone login (step 1: send code). */
  sendCode: (phone: string) => Promise<{ phoneCodeHash: string }>;
  /** Connect with phone login (step 2: verify code). */
  signIn: (phone: string, code: string, phoneCodeHash: string) => Promise<Api.User>;
  /** Connect with 2FA password. */
  signIn2FA: (password: string) => Promise<Api.User>;
  /** Get session string (only accessible via context, not global singleton). */
  getSessionString: () => string;
  /** Persist the authenticated session. */
  persistSession: (user: Api.User, phoneLast4?: string) => Promise<void>;
  /** Disconnect and clear everything. */
  disconnect: () => Promise<void>;
  /** Force reconnect (e.g. after page reload). */
  reconnect: () => Promise<void>;
}

const TelegramContext = React.createContext<TelegramContextValue | null>(null);

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = React.useState<TgStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [phoneLast4, setPhoneLast4] = React.useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = React.useState<number | null>(null);
  const serviceRef = React.useRef(TelegramBrowserService.getInstance());
  const isRestoringRef = React.useRef(false);
  const reconnectAttemptRef = React.useRef(0);
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnectedRef = React.useRef(false);

  // Multi-tab coordination: notify other tabs on connect/disconnect
  const channelRef = React.useRef<BroadcastChannel | null>(null);

  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || !user?.id) return;
    const ch = new BroadcastChannel(`suprateam-tg-${user.id}`);
    channelRef.current = ch;

    ch.onmessage = (e) => {
      // Ignore our own messages and unauthenticated messages
      if (!e.data?.nonce || e.data.nonce === CHANNEL_NONCE) return;
      if (typeof e.data?.type !== "string") return;

      if (e.data.type === "tg-connected") {
        // Another tab connected — disconnect this tab to avoid session conflict
        serviceRef.current.disconnect().catch(() => {});
        setStatus("disconnected");
        setError("Telegram session taken by another tab. Refresh to reconnect.");
      } else if (e.data.type === "tg-disconnected") {
        // Another tab disconnected — reset this tab too
        setStatus("disconnected");
        setPhoneLast4(null);
        setTelegramUserId(null);
      }
    };

    return () => ch.close();
  }, [user?.id]);

  // Auto-restore session on mount (waits for auth user)
  React.useEffect(() => {
    if (!user?.id) {
      setStatus("disconnected");
      return;
    }
    // Scope encryption key to this Supabase user
    setEncryptionUserId(user.id);
    restoreSession();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      serviceRef.current.disconnect().catch(() => {});
    };
  }, [user?.id]);

  // Connection health monitor — uses refs to avoid effect feedback loops
  const statusRef = React.useRef(status);
  statusRef.current = status;
  const reconnectScheduledRef = React.useRef(false);

  React.useEffect(() => {
    if (status === "connected") {
      wasConnectedRef.current = true;
      reconnectAttemptRef.current = 0;
      reconnectScheduledRef.current = false;
      return;
    }

    // Only schedule reconnect for error/disconnected, and only once per drop
    if ((status === "error" || status === "disconnected") && wasConnectedRef.current && user?.id && !reconnectScheduledRef.current) {
      // Don't auto-reconnect if another tab took the session
      if (error?.includes("another tab")) return;

      const attempt = reconnectAttemptRef.current;
      if (attempt >= RECONNECT_DELAYS.length) return;

      reconnectScheduledRef.current = true;
      const delay = RECONNECT_DELAYS[attempt];
      setStatus("reconnecting");
      setError(`Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${attempt + 1}/${RECONNECT_DELAYS.length})`);

      reconnectTimerRef.current = setTimeout(async () => {
        reconnectScheduledRef.current = false;
        reconnectAttemptRef.current = attempt + 1;
        try {
          await restoreSession();
        } catch {
          // restoreSession handles its own error state
        }
      }, delay);
    }
  // Only trigger on status changes — not on error text changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user?.id]);

  // Network online/offline detection
  React.useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function handleOnline() {
      // Debounce to avoid hammering on network flapping
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (wasConnectedRef.current && statusRef.current !== "connected" && statusRef.current !== "connecting") {
          reconnectAttemptRef.current = 0;
          reconnectScheduledRef.current = false;
          restoreSession();
        }
      }, 1000);
    }
    function handleOffline() {
      if (statusRef.current === "connected") {
        setStatus("error");
        setError("Network offline — will reconnect when back online");
      }
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // Uses refs for status — no need for status in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restoreSession() {
    // Guard against double-invocation (React Strict Mode fires effects twice)
    if (isRestoringRef.current) return;
    isRestoringRef.current = true;
    try {
      setStatus("loading");
      const result = await loadSession();

      if (result.needsReauth) {
        setStatus("needs-reauth");
        return;
      }

      if (!result.sessionString) {
        setStatus("disconnected");
        return;
      }

      setStatus("connecting");
      await serviceRef.current.connect(result.sessionString);
      setPhoneLast4(result.phoneLast4 ?? null);
      setTelegramUserId(result.telegramUserId ?? null);
      setStatus("connected");
    } catch (err) {
      console.error("[TelegramProvider] restore failed:", err);
      setError(err instanceof Error ? err.message : "Failed to restore session");
      setStatus("error");
    } finally {
      isRestoringRef.current = false;
    }
  }

  const sendCode = React.useCallback(async (phone: string) => {
    if (!user?.id) throw new Error("Not authenticated");
    setStatus("connecting");
    setError(null);
    // Scope encryption key to this user before generating
    setEncryptionUserId(user.id);
    await getOrCreateEncryptionKey();
    // Start a fresh client for the auth flow
    await serviceRef.current.connect("");
    return serviceRef.current.sendCode(phone);
  }, [user?.id]);

  const signIn = React.useCallback(
    async (phone: string, code: string, phoneCodeHash: string) => {
      return serviceRef.current.signIn(phone, code, phoneCodeHash);
    },
    []
  );

  const signIn2FA = React.useCallback(async (password: string) => {
    return serviceRef.current.signIn2FA(password);
  }, []);

  const getSessionString = React.useCallback(() => {
    return serviceRef.current.getSessionString();
  }, []);

  const persistSession = React.useCallback(
    async (tgUser: Api.User, last4?: string) => {
      const sessionString = serviceRef.current.getSessionString();
      const tgUserId = Number(tgUser.id);
      await saveSession(sessionString, last4, tgUserId);
      setPhoneLast4(last4 ?? null);
      setTelegramUserId(tgUserId);
      setStatus("connected");
      channelRef.current?.postMessage({ type: "tg-connected", nonce: CHANNEL_NONCE });
    },
    []
  );

  const disconnect = React.useCallback(async () => {
    // Stop auto-reconnect
    wasConnectedRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    await serviceRef.current.disconnect();
    await clearSession();
    setPhoneLast4(null);
    setTelegramUserId(null);
    setStatus("disconnected");
    setError(null);
    channelRef.current?.postMessage({ type: "tg-disconnected", nonce: CHANNEL_NONCE });
  }, []);

  const reconnect = React.useCallback(async () => {
    // Clear any pending auto-reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    wasConnectedRef.current = true; // Allow auto-reconnect after manual reconnect
    await restoreSession();
  }, []);

  const value = React.useMemo<TelegramContextValue>(
    () => ({
      status,
      error,
      phoneLast4,
      telegramUserId,
      service: serviceRef.current,
      getSessionString,
      sendCode,
      signIn,
      signIn2FA,
      persistSession,
      disconnect,
      reconnect,
    }),
    [status, error, phoneLast4, telegramUserId, getSessionString, sendCode, signIn, signIn2FA, persistSession, disconnect, reconnect]
  );

  return (
    <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>
  );
}

export function useTelegram(): TelegramContextValue {
  const ctx = React.useContext(TelegramContext);
  if (!ctx) {
    throw new Error("useTelegram must be used within <TelegramProvider>");
  }
  return ctx;
}
