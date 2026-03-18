export default function TeamSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage team members, roles (BD Lead, Marketing Lead, Admin Lead), and slug access.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Team management will be available once roles and slug-based access control are built.
        </p>
      </div>
    </div>
  );
}
