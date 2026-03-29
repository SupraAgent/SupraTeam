"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

type Connection = {
  id: string;
  provider: string;
  email: string;
  is_default: boolean;
  connected_at: string;
  last_sync_at: string | null;
};

export default function EmailSettingsPage() {
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connecting, setConnecting] = React.useState(false);
  const [showPersonalForm, setShowPersonalForm] = React.useState(false);
  const [personalEmail, setPersonalEmail] = React.useState("");
  const [personalAppPassword, setPersonalAppPassword] = React.useState("");
  const [personalConnecting, setPersonalConnecting] = React.useState(false);
  const [personalError, setPersonalError] = React.useState("");
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const error = searchParams.get("error");

  async function fetchConnections() {
    setLoading(true);
    try {
      const res = await fetch("/api/email/connections");
      if (res.ok) {
        const json = await res.json();
        setConnections(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchConnections(); }, []);

  async function handleConnectGmail() {
    setConnecting(true);
    try {
      const res = await fetch("/api/email/connections/gmail", { method: "POST" });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert(json.error ?? "Failed to start Gmail OAuth");
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleConnectPersonalGmail() {
    setPersonalError("");
    if (!personalEmail || !personalAppPassword) {
      setPersonalError("Email and app password are required");
      return;
    }
    setPersonalConnecting(true);
    try {
      const res = await fetch("/api/email/connections/gmail-personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: personalEmail, appPassword: personalAppPassword }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success("Personal Gmail connected!");
        setShowPersonalForm(false);
        setPersonalEmail("");
        setPersonalAppPassword("");
        fetchConnections();
      } else {
        setPersonalError(json.error ?? "Failed to connect");
      }
    } catch {
      setPersonalError("Connection failed. Please try again.");
    } finally {
      setPersonalConnecting(false);
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Disconnect this email account?")) return;
    await fetch(`/api/email/connections?id=${id}`, { method: "DELETE" });
    fetchConnections();
  }

  async function handleSetDefault(id: string) {
    await fetch("/api/email/connections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchConnections();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Email Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your email accounts to send and receive email from within SupraTeam.
        </p>
      </div>

      {/* Status messages */}
      {success === "connected" && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Gmail connected successfully! Head to the{" "}
          <a href="/email" className="font-medium underline">Email</a>{" "}
          tab to start using it.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Connection failed: {({
            access_denied: "Access was denied by Google",
            missing_params: "Missing OAuth parameters",
            invalid_state: "Invalid or expired session — please try again",
            state_expired: "Session expired — please try again",
            user_mismatch: "Logged-in user doesn't match the OAuth session",
            session_required: "You must be logged in to connect Gmail",
            not_authenticated: "You must be logged in to connect Gmail",
            server_error: "Server configuration error",
            no_tokens: "Google did not return access tokens",
            no_refresh_token: "Google did not return a refresh token. Please try again and make sure to grant all permissions when prompted.",
            state_reused: "This authorization link has already been used — please start a new connection",
            no_email: "Could not retrieve email address from Google",
            oauth_failed: "OAuth exchange failed — please try again",
          } as Record<string, string>)[error] ?? "An unexpected error occurred"}
        </div>
      )}

      {/* Connected accounts */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Connected Accounts</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button size="default" onClick={handleConnectGmail} disabled={connecting} className="px-5 py-2.5 text-sm w-full sm:w-auto">
              <GmailIcon className="h-5 w-5 mr-2" />
              {connecting ? "Connecting..." : "Connect Gmail"}
            </Button>
            <Button
              size="default"
              variant="outline"
              onClick={() => setShowPersonalForm(!showPersonalForm)}
              className="px-5 py-2.5 text-sm w-full sm:w-auto"
            >
              <PersonalMailIcon className="h-5 w-5 mr-2" />
              Personal Gmail
            </Button>
          </div>
        </div>

        {/* Personal Gmail connection form */}
        {showPersonalForm && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Connect Personal Gmail</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use a Google App Password to connect your personal Gmail account via IMAP/SMTP.
                No Google Cloud project required.
              </p>
            </div>
            <div className="space-y-2">
              <input
                type="email"
                placeholder="your.email@gmail.com"
                value={personalEmail}
                onChange={(e) => setPersonalEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground
                  placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50"
              />
              <input
                type="password"
                placeholder="Google App Password (16 characters)"
                value={personalAppPassword}
                onChange={(e) => setPersonalAppPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground
                  placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            {personalError && (
              <p className="text-xs text-red-400">{personalError}</p>
            )}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                size="default"
                onClick={handleConnectPersonalGmail}
                disabled={personalConnecting}
                className="px-5 py-2.5 text-sm"
              >
                {personalConnecting ? "Verifying..." : "Connect"}
              </Button>
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Generate an App Password &rarr;
              </a>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/80">How to get an App Password:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Go to <span className="text-foreground">myaccount.google.com/apppasswords</span></li>
                <li>You may need to enable 2-Step Verification first</li>
                <li>Create a new app password (name it &quot;SupraTeam&quot;)</li>
                <li>Copy the 16-character password and paste it above</li>
              </ol>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : connections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
            <MailIcon className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No email accounts connected</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Connect your Gmail to read, send, and manage email alongside your deals.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    conn.provider === "gmail_app_password" ? "bg-blue-500/10" : "bg-red-500/10"
                  }`}>
                    {conn.provider === "gmail_app_password"
                      ? <PersonalMailIcon className="h-4 w-4" />
                      : <GmailIcon className="h-4 w-4" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{conn.email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Connected {new Date(conn.connected_at).toLocaleDateString()}
                      {conn.is_default && (
                        <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary font-medium">
                          Default
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-2 shrink-0 pl-11 sm:pl-0">
                  {!conn.is_default && (
                    <button
                      onClick={() => handleSetDefault(conn.id)}
                      className="text-xs sm:text-[10px] text-primary hover:underline"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    className="text-xs sm:text-[10px] text-red-400 hover:underline"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signatures */}
      {connections.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Email Signatures</h2>
          <p className="text-xs text-muted-foreground">
            Set a signature for each connected account. It will be appended to all outgoing emails.
          </p>
          {connections.map((conn) => (
            <SignatureEditor key={conn.id} connectionId={conn.id} email={conn.email} />
          ))}
        </div>
      )}

      {/* Setup guide */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-medium text-foreground">Setup Requirements</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-foreground/80 mb-1">Connect Gmail (OAuth — for Workspace accounts)</p>
            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
              <li>A Google Cloud project with the <span className="text-foreground">Gmail API</span> enabled</li>
              <li>OAuth 2.0 credentials (Web application type) with the redirect URI pointing to your CRM domain</li>
              <li>Set <span className="font-mono text-foreground">GOOGLE_CLIENT_ID</span> and <span className="font-mono text-foreground">GOOGLE_CLIENT_SECRET</span> in your environment</li>
            </ol>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground/80 mb-1">Personal Gmail (App Password — for any Gmail account)</p>
            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
              <li>Enable 2-Step Verification on your Google account</li>
              <li>Generate an App Password at <span className="text-foreground">myaccount.google.com/apppasswords</span></li>
              <li>No Google Cloud project or admin access required</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts reference */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Keyboard Shortcuts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs">
          {[
            ["j / k", "Next / previous thread"],
            ["Enter", "Open thread"],
            ["Escape", "Back to list"],
            ["e", "Archive"],
            ["#", "Trash"],
            ["r", "Reply"],
            ["a", "Reply all"],
            ["f", "Forward"],
            ["s", "Star / unstar"],
            ["u", "Mark unread"],
            ["c", "Compose new"],
            ["/", "Search"],
            ["h", "Snooze"],
            ["⌘+Enter", "Send email"],
            ["⌘+;", "Insert template"],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between py-0.5">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                {key}
              </kbd>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignatureEditor({ connectionId, email }: { connectionId: string; email: string }) {
  const [signature, setSignature] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/email/signatures?connection_id=${connectionId}`)
      .then((r) => r.json())
      .then((json) => {
        const sig = (json.data ?? []).find((s: { connection_id: string }) => s.connection_id === connectionId);
        setSignature(sig?.signature_html ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [connectionId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/email/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connectionId,
          signature_html: signature,
          signature_text: signature.replace(/<[^>]+>/g, ""),
        }),
      });
      if (res.ok) {
        toast.success("Signature saved");
      } else {
        toast.error("Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground">Loading...</p>;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <p className="text-xs text-foreground font-medium">{email}</p>
      <textarea
        value={signature}
        onChange={(e) => setSignature(e.target.value)}
        placeholder="Your signature (HTML supported)&#10;&#10;e.g.&#10;Best regards,&#10;Jon — Supra&#10;supra.com"
        className="w-full h-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground
          placeholder:text-muted-foreground/40 outline-none resize-none focus:ring-1 focus:ring-primary/50"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Signature"}
        </Button>
      </div>
    </div>
  );
}

function GmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M2 6l10 7 10-7v12H2V6z" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 6L12 13 2 6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonalMailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h6" />
      <polyline points="20 6 12 13 4 6" />
      <circle cx="18" cy="18" r="3" />
      <path d="M18 15v2l1.5 1" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22 6 12 13 2 6" />
    </svg>
  );
}
