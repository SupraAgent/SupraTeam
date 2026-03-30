"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import { CalendarConnectCard } from "@/components/calendar/connect-card";

export default function CalendarSettingsPage() {
  // Check for URL params from OAuth callback
  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("cal_success");
    const error = params.get("cal_error");

    if (success === "connected") {
      setStatusMessage({ type: "success", message: "Google Calendar connected successfully! Initial sync in progress." });
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_state: "Invalid OAuth state. Please try again.",
        state_expired: "OAuth session expired. Please try again.",
        state_reused: "OAuth session already used. Please try again.",
        no_tokens: "Google did not return access tokens.",
        no_email: "Could not retrieve your Google email.",
        no_refresh_token: "Google did not grant offline access. Please try again.",
        oauth_failed: "OAuth authentication failed. Please try again.",
        user_mismatch: "User session mismatch. Please log in and try again.",
      };
      setStatusMessage({ type: "error", message: messages[error] ?? `Connection failed: ${error}` });
    }

    // Clean up URL
    if (success || error) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4285f4]/10">
            <Calendar className="h-5 w-5 text-[#4285f4]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Google Calendar</h1>
            <p className="text-xs text-muted-foreground">
              Sync events, link meetings to deals and contacts
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

      {/* Connection card */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Connected Accounts</h2>
        <CalendarConnectCard />
      </div>

      {/* Info */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">How it works</h3>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">1.</span>
            Connect your Google account to grant calendar access
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">2.</span>
            Events sync automatically (90 days past, 1 year future)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">3.</span>
            Events appear in the Calendar page and email dashboard
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">4.</span>
            Attendee emails are auto-linked to CRM contacts
          </li>
        </ul>
      </div>
    </div>
  );
}
