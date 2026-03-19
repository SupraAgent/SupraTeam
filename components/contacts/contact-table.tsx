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
    <>
      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border border-white/10 overflow-hidden">
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

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => onRowClick(contact)}
            className="rounded-xl border border-white/10 bg-white/[0.035] p-3 cursor-pointer transition hover:bg-white/[0.06] active:bg-white/[0.08]"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{contact.name}</p>
              <span className="text-[10px] text-muted-foreground">{timeAgo(contact.created_at)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {contact.company && <span>{contact.company}</span>}
              {contact.company && contact.telegram_username && <span className="text-white/20">·</span>}
              {contact.telegram_username && <span className="text-primary">@{contact.telegram_username}</span>}
            </div>
            {contact.email && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/60 truncate">{contact.email}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
