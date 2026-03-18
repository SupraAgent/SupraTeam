export default function IntegrationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Telegram bot token and other integrations.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Telegram Bot</p>
            <p className="text-xs text-muted-foreground">Connect your bot to manage groups and send messages.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
            Not connected
          </span>
        </div>
      </div>
    </div>
  );
}
