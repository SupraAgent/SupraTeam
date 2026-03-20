"use client";

import type { Contact } from "@/lib/types";
import { timeAgo, cn } from "@/lib/utils";

type ContactTableProps = {
  contacts: Contact[];
  onRowClick: (contact: Contact) => void;
  dealCountMap?: Record<string, number>;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
};

export function ContactTable({ contacts, onRowClick, dealCountMap, selected, onToggleSelect, onToggleSelectAll }: ContactTableProps) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No contacts yet. Add your first contact to get started.
        </p>
      </div>
    );
  }

  const allSelected = selected && contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              {onToggleSelect && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    className="rounded border-white/20 bg-white/5"
                  />
                </th>
              )}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Company</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Telegram</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
              {dealCountMap && <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Deals</th>}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                className={cn(
                  "border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors",
                  selected?.has(contact.id) && "bg-primary/5"
                )}
              >
                {onToggleSelect && (
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected?.has(contact.id) ?? false}
                      onChange={() => onToggleSelect(contact.id)}
                      className="rounded border-white/20 bg-white/5"
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-foreground font-medium" onClick={() => onRowClick(contact)}>{contact.name}</td>
                <td className="px-4 py-3 text-muted-foreground" onClick={() => onRowClick(contact)}>{contact.company ?? "-"}</td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  {contact.telegram_username ? (
                    <span className="text-primary">@{contact.telegram_username}</span>
                  ) : (
                    <span className="text-muted-foreground/50">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground" onClick={() => onRowClick(contact)}>{contact.email ?? "-"}</td>
                {dealCountMap && (
                  <td className="px-4 py-3 text-center" onClick={() => onRowClick(contact)}>
                    {dealCountMap[contact.id] ? (
                      <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {dealCountMap[contact.id]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30 text-xs">0</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground text-xs" onClick={() => onRowClick(contact)}>{timeAgo(contact.created_at)}</td>
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
            className={cn(
              "rounded-xl border border-white/10 bg-white/[0.035] p-3 cursor-pointer transition hover:bg-white/[0.06] active:bg-white/[0.08]",
              selected?.has(contact.id) && "border-primary/40 bg-primary/5"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {onToggleSelect && (
                  <input
                    type="checkbox"
                    checked={selected?.has(contact.id) ?? false}
                    onChange={(e) => { e.stopPropagation(); onToggleSelect(contact.id); }}
                    className="rounded border-white/20 bg-white/5"
                  />
                )}
                <p className="text-sm font-medium text-foreground">{contact.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {dealCountMap && dealCountMap[contact.id] && (
                  <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {dealCountMap[contact.id]} deal{dealCountMap[contact.id] !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">{timeAgo(contact.created_at)}</span>
              </div>
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
