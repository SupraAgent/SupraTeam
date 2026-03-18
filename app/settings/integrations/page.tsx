"use client";

import * as React from "react";

type BotStatus = {
  connected: boolean;
  reason?: string;
  bot?: { id: number; username: string; first_name: string };
  groups?: number;
};

export default function IntegrationsPage() {
  const [status, setStatus] = React.useState<BotStatus | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/bot/status")
      .then((r) => (r.ok ? r.json() : { connected: false, reason: "Failed to check" }))
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your Telegram bot connection and other integrations.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#229ED9]/20 flex items-center justify-center">
              <svg className="h-5 w-5 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Telegram Bot</p>
              <p className="text-xs text-muted-foreground">Manage groups and send pipeline notifications.</p>
            </div>
          </div>

          {loading ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
              Checking...
            </span>
          ) : status?.connected ? (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
              Connected
            </span>
          ) : (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-400">
              Not connected
            </span>
          )}
        </div>

        {!loading && status?.connected && status.bot && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bot username</span>
              <a
                href={`https://t.me/${status.bot.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                @{status.bot.username}
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bot name</span>
              <span className="text-sm text-foreground">{status.bot.first_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Groups administered</span>
              <span className="text-sm text-foreground">{status.groups}</span>
            </div>
          </div>
        )}

        {!loading && !status?.connected && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-muted-foreground">
              {status?.reason ?? "Bot token not configured."}
              {" "}Set TELEGRAM_BOT_TOKEN in .env.local and run `npm run bot` to connect.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
