"use client";

import type { Contact } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type ContactTableProps = {
  contacts: Contact[];
  onRowClick: (contact: Contact) => void;
};

export function ContactTable({ contacts, onRowClick }: ContactTableProps) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No contacts yet. Add your first contact to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Company</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Telegram</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Created</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              onClick={() => onRowClick(contact)}
              className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 text-foreground font-medium">{contact.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{contact.company ?? "-"}</td>
              <td className="px-4 py-3">
                {contact.telegram_username ? (
                  <span className="text-primary">@{contact.telegram_username}</span>
                ) : (
                  <span className="text-muted-foreground/50">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{contact.email ?? "-"}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{timeAgo(contact.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
