export default function ContactsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your CRM contacts. Link Telegram usernames and track deal associations.
          </p>
        </div>
        <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110 transition">
          Add Contact
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No contacts yet. Add your first contact to get started.
        </p>
      </div>
    </div>
  );
}
