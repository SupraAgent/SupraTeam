export default function GroupsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Telegram Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Groups and channels where the bot is admin. Tag with slugs for bulk access control.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No groups connected. Add the Telegram bot to your groups as an admin, then they'll appear here.
        </p>
      </div>
    </div>
  );
}
