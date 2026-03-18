"use client";

import * as React from "react";
import { ContactTable } from "@/components/contacts/contact-table";
import { CreateContactModal } from "@/components/contacts/create-contact-modal";
import { ContactDetailPanel } from "@/components/contacts/contact-detail-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchContacts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/contacts");
      if (res.ok) {
        const { contacts } = await res.json();
        setContacts(contacts);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const filtered = search
    ? contacts.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.telegram_username?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
        );
      })
    : contacts;

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
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Add Contact
        </Button>
      </div>

      {contacts.length > 0 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, company, telegram, email..."
          className="max-w-sm"
        />
      )}

      <ContactTable contacts={filtered} onRowClick={setSelectedContact} />

      <CreateContactModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchContacts}
      />

      <ContactDetailPanel
        contact={selectedContact}
        open={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        onDeleted={fetchContacts}
      />
    </div>
  );
}
