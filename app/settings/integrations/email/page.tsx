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
          Connection failed: {error.replace(/_/g, " ")}
        </div>
      )}

      {/* Connected accounts */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Connected Accounts</h2>
          <Button size="default" onClick={handleConnectGmail} disabled={connecting} className="px-5 py-2.5 text-sm">
            <GmailIcon className="h-5 w-5 mr-2" />
            {connecting ? "Connecting..." : "Connect Gmail"}
          </Button>
        </div>

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
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <GmailIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground">{conn.email}</p>
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
                <div className="flex items-center gap-2">
                  {!conn.is_default && (
                    <button
                      onClick={() => handleSetDefault(conn.id)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    className="text-[10px] text-red-400 hover:underline"
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
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Setup Requirements</h2>
        <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
          <li>A Google Cloud project with the <span className="text-foreground">Gmail API</span> enabled</li>
          <li>OAuth 2.0 credentials (Web application type) with the redirect URI pointing to your CRM domain</li>
          <li>Set <span className="font-mono text-foreground">GOOGLE_CLIENT_ID</span> and <span className="font-mono text-foreground">GOOGLE_CLIENT_SECRET</span> in your environment</li>
          <li>Each team member connects their own Gmail — no Workspace admin required</li>
        </ol>
      </div>

      {/* Keyboard shortcuts reference */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Keyboard Shortcuts</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
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

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22 6 12 13 2 6" />
    </svg>
  );
}
