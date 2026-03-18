export default function PipelinePage() {
  const stages = [
    "Potential Client",
    "Outreach",
    "Calendly Sent",
    "Video Call",
    "Follow Up",
    "MOU Signed",
    "First Check Received",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag deals between stages. Filter by BD, Marketing, or Admin board.
          </p>
        </div>
        <div className="flex gap-2">
          {["All", "BD", "Marketing", "Admin"].map((tab) => (
            <button
              key={tab}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "All"
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 thin-scroll">
        {stages.map((stage) => (
          <div
            key={stage}
            className="min-w-[260px] flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.02]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <span className="text-xs font-medium text-foreground">{stage}</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                0
              </span>
            </div>
            <div className="p-2 min-h-[200px]">
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground/50">No deals</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
