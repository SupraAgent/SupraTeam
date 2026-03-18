export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your CRM pipeline, team activity, and Telegram groups.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Open Deals", value: "0", sub: "Across all boards" },
          { label: "Contacts", value: "0", sub: "Total in database" },
          { label: "TG Groups", value: "0", sub: "Bot is admin" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground/60">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Pipeline and activity data will appear here once you create deals and connect your Telegram bot.
        </p>
      </div>
    </div>
  );
}
