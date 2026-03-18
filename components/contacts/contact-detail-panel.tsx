"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type ContactDetailPanelProps = {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export function ContactDetailPanel({ contact, open, onClose, onDeleted }: ContactDetailPanelProps) {
  const [deleting, setDeleting] = React.useState(false);

  if (!contact) return null;

  async function handleDelete() {
    if (!contact) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title={contact.name}>
      <div className="space-y-4">
        {contact.company && (
          <div>
            <p className="text-xs text-muted-foreground">Company</p>
            <p className="text-sm text-foreground">{contact.company}</p>
          </div>
        )}
        {contact.title && (
          <div>
            <p className="text-xs text-muted-foreground">Title</p>
            <p className="text-sm text-foreground">{contact.title}</p>
          </div>
        )}
        {contact.telegram_username && (
          <div>
            <p className="text-xs text-muted-foreground">Telegram</p>
            <p className="text-sm text-primary">@{contact.telegram_username}</p>
          </div>
        )}
        {contact.email && (
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm text-foreground">{contact.email}</p>
          </div>
        )}
        {contact.phone && (
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="text-sm text-foreground">{contact.phone}</p>
          </div>
        )}
        {contact.notes && (
          <div>
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="text-sm text-foreground">{timeAgo(contact.created_at)}</p>
        </div>

        <div className="pt-4 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            {deleting ? "Deleting..." : "Delete Contact"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}
