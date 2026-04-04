"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Loader2, ExternalLink } from "lucide-react";

interface CalendlyConnection {
  id: string;
  calendly_email: string;
  calendly_name: string | null;
  scheduling_url: string | null;
  is_active: boolean;
  connected_at: string;
}

export default function CalendlySettingsPage() {
  const [connection, setConnection] = React.useState<CalendlyConnection | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    // Check URL params from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const success = params.get("calendly_success");
    const error = params.get("calendly_error");

    if (success === "connected") {
      setStatusMessage({
        type: "success",
        message: "Calendly connected successfully! Webhook subscription created.",
      });
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_state: "Invalid OAuth state. Please try again.",
        state_expired: "OAuth session expired. Please try again.",
        state_reused: "OAuth session already used. Please try again.",
        no_tokens: "Calendly did not return access tokens.",
        oauth_failed: "OAuth authentication failed. Please try again.",
        user_mismatch: "User session mismatch. Please log in and try again.",
        invalid_user: "Could not retrieve your Calendly profile.",
        user_fetch_failed: "Failed to fetch your Calendly profile.",
        missing_params: "Missing OAuth parameters. Please try again.",
        session_required: "Please log in first.",
        server_error: "Server error. Please try again.",
      };
      setStatusMessage({
        type: "error",
        message: messages[error] ?? `Connection failed: ${error}`,
      });
    }

    if (success || error) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    fetchConnection();
  }, []);

  async function fetchConnection() {
    try {
      const res = await fetch("/api/calendly/event-types");
      if (res.ok) {
        // If event types load, connection exists
        const connRes = await fetch("/api/calendly/event-types");
        if (connRes.ok) {
          // Fetch connection details from a separate endpoint
          // For now, infer from successful event types call
          setConnection({
            id: "active",
            calendly_email: "connected",
            calendly_name: null,
            scheduling_url: null,
            is_active: true,
            connected_at: new Date().toISOString(),
          });
        }
      }
    } catch {
      // No connection
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/calendly/connect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setStatusMessage({ type: "error", message: data.error || "Failed to start connection" });
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setStatusMessage({ type: "error", message: "Failed to initiate connection" });
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Calendly? Booking links will stop tracking.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/calendly/disconnect", { method: "DELETE" });
      if (res.ok) {
        setConnection(null);
        setStatusMessage({ type: "success", message: "Calendly disconnected." });
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#006BFF]/10">
            <Calendar className="h-5 w-5 text-[#006BFF]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Calendly</h1>
            <p className="text-xs text-muted-foreground">
              Schedule meetings from TG conversations, auto-advance deals
            </p>
          </div>
        </div>
      </div>

      {/* Status message from OAuth callback */}
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

      {/* Connection status */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking connection...
        </div>
      ) : connection ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Connected</p>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  Active
                </span>
              </div>
              {connection.calendly_email !== "connected" && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {connection.calendly_email}
                </p>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
          {connection.scheduling_url && (
            <a
              href={connection.scheduling_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View Calendly profile
            </a>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your Calendly account to send booking links from Telegram conversations
            and auto-advance deals when meetings are booked.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#006BFF] px-4 py-2 text-sm font-medium text-white hover:bg-[#006BFF]/90 transition-colors disabled:opacity-50"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Calendly"
            )}
          </button>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">How it works</h3>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">1.</span>
            Connect your Calendly account to grant scheduling access
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">2.</span>
            Click &ldquo;Send Booking Link&rdquo; in any TG conversation to generate a tracked link
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">3.</span>
            When a prospect books, the deal auto-advances to &ldquo;Video Call&rdquo;
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">4.</span>
            Bookings, cancellations, and no-shows appear in the deal timeline
          </li>
        </ul>
      </div>
    </div>
  );
}
