"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TgContact = {
  id: string;
  telegram_user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone_last4: string | null;
  is_mutual: boolean;
  imported_at: string;
  shared?: boolean; // computed client-side
};

export default function TelegramContactsPage() {
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [contacts, setContacts] = React.useState<TgContact[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [sharing, setSharing] = React.useState<string | null>(null);
  const [importMsg, setImportMsg] = React.useState("");
  const [totalCount, setTotalCount] = React.useState(0);

  React.useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    const res = await fetch("/api/telegram-client/status");
    const data = await res.json();
    setConnected(data.connected);
    if (data.connected) fetchContacts();
  }

  async function fetchContacts() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/telegram-client/contacts?${params}`);
      const data = await res.json();
      setContacts(data.data || []);
      setTotalCount(data.count || 0);
    } finally {
      setLoading(false);
    }
  }

  // Re-fetch when search changes (debounced)
  React.useEffect(() => {
    if (!connected) return;
    const t = setTimeout(fetchContacts, 300);
    return () => clearTimeout(t);
  }, [search, connected]);

  async function handleImport() {
    setImporting(true);
    setImportMsg("");
    try {
      const res = await fetch("/api/telegram-client/contacts", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setImportMsg(`Imported ${data.imported} contacts`);
        fetchContacts();
      } else {
        setImportMsg(data.error || "Import failed");
      }
    } finally {
      setImporting(false);
      setTimeout(() => setImportMsg(""), 5000);
    }
  }

  async function handleShare(contact: TgContact) {
    setSharing(contact.id);
    try {
      const res = await fetch("/api/telegram-client/contacts/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateContactId: contact.id }),
      });
      if (res.ok) {
        // Mark as shared locally
        setContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, shared: true } : c))
        );
      }
    } finally {
      setSharing(null);
    }
  }

  // Not connected
  if (connected === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Telegram Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your Telegram to import and manage contacts.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Telegram not connected.</p>
          <a
            href="/settings/integrations/connect"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium h-9 px-3 hover:brightness-110 transition-all"
          >
            Connect Telegram
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Telegram Contacts</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {totalCount} private contacts. Only you can see these.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleImport} disabled={importing}>
            {importing ? "Importing..." : "Sync from Telegram"}
          </Button>
        </div>
      </div>

      {importMsg && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-primary">{importMsg}</p>
        </div>
      )}

      {/* Privacy badge */}
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
        <LockIcon className="h-3.5 w-3.5 text-green-400 shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          These contacts are private to your account. Use &ldquo;Share with CRM&rdquo; to make a contact visible to your team.
        </p>
      </div>

      {/* Search */}
      <Input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts..."
        className="text-sm"
      />

      {/* Contact list */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
        {loading && contacts.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>
        )}
        {!loading && contacts.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <p className="text-xs text-muted-foreground">No contacts yet.</p>
            <Button size="sm" onClick={handleImport} disabled={importing}>
              Import from Telegram
            </Button>
          </div>
        )}
        <div className="divide-y divide-white/5">
          {contacts.map((c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
            return (
              <div
                key={c.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-medium text-blue-400 shrink-0">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {name}
                      {c.is_mutual && (
                        <span className="ml-1.5 text-[10px] text-green-400">mutual</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.username ? `@${c.username}` : ""}
                      {c.phone_last4 ? ` · •••${c.phone_last4}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.shared ? (
                    <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                      Shared
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7"
                      onClick={() => handleShare(c)}
                      disabled={sharing === c.id}
                    >
                      {sharing === c.id ? "..." : "Share with CRM"}
                    </Button>
                  )}
                  <a
                    href={`/inbox?open=user_${c.telegram_user_id}`}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-foreground hover:border-white/10 hover:bg-white/5 text-xs font-medium h-7 px-3 transition-all"
                  >
                    Message
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
