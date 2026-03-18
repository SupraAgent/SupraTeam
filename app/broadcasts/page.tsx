export default function BroadcastsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Broadcasts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send messages to Telegram groups filtered by slug. View broadcast history and delivery stats.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your Telegram bot and add groups before sending broadcasts.
        </p>
      </div>
    </div>
  );
}
