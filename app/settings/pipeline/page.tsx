export default function PipelineSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pipeline Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure pipeline stages, automation triggers, and reminder timing.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Pipeline configuration will be available in Phase 3.
        </p>
      </div>
    </div>
  );
}
