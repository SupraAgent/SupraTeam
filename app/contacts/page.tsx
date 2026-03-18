"use client";

import * as React from "react";
import { ContactTable } from "@/components/contacts/contact-table";
import { CreateContactModal } from "@/components/contacts/create-contact-modal";
import { ContactDetailPanel } from "@/components/contacts/contact-detail-panel";
import { ImportTelegramModal } from "@/components/contacts/import-telegram-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import type { Contact, PipelineStage } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ContactsPage() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [search, setSearch] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState<string>("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    try {
      const [contactsRes, stagesRes] = await Promise.all([
        fetch("/api/contacts"),
        fetch("/api/pipeline"),
      ]);
      if (contactsRes.ok) {
        const { contacts } = await contactsRes.json();
        setContacts(contacts);
      }
      if (stagesRes.ok) {
        const { stages } = await stagesRes.json();
        setStages(stages);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = contacts.filter((c) => {
    // Stage filter
    if (stageFilter === "unassigned" && c.stage_id) return false;
    if (stageFilter !== "all" && stageFilter !== "unassigned" && c.stage_id !== stageFilter) return false;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.telegram_username?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-[300px] rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} in database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Import from Telegram
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stage filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          <button
            onClick={() => setStageFilter("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              stageFilter === "all"
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            All ({contacts.length})
          </button>
          {stages.map((stage) => {
            const count = contacts.filter((c) => c.stage_id === stage.id).length;
            return (
              <button
                key={stage.id}
                onClick={() => setStageFilter(stage.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  stageFilter === stage.id
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {stage.name}
                {count > 0 && <span className="ml-1 text-muted-foreground/60">({count})</span>}
              </button>
            );
          })}
          <button
            onClick={() => setStageFilter("unassigned")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              stageFilter === "unassigned"
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            No Stage ({contacts.filter((c) => !c.stage_id).length})
          </button>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="max-w-[200px] h-8 text-xs"
        />
      </div>

      <ContactTable contacts={filtered} onRowClick={setSelectedContact} />

      <CreateContactModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchData}
      />

      <ImportTelegramModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchData}
      />

      <ContactDetailPanel
        contact={selectedContact}
        open={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        onDeleted={fetchData}
      />
    </div>
  );
}
