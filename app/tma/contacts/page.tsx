"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Users, ChevronRight, Zap, Search } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";

type Contact = {
  id: string;
  name: string;
  company: string | null;
  telegram_username: string | null;
  email: string | null;
  lifecycle_stage: string | null;
};

export default function TMAContactsPage() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Telegram) {
      const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void } } }).Telegram.WebApp;
      tg.ready();
      tg.expand();
    }

    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.company?.toLowerCase().includes(search.toLowerCase()) ||
        c.telegram_username?.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 bg-white/[0.02] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="px-4 pt-4 pb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
        <span className="text-xs text-muted-foreground">{contacts.length} total</span>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="px-4 space-y-1">
        {filtered.map((contact) => (
          <div
            key={contact.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 transition active:bg-white/[0.06]"
          >
            <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">
                {contact.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{contact.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {contact.company && (
                  <span className="text-[10px] text-muted-foreground truncate">{contact.company}</span>
                )}
                {contact.telegram_username && (
                  <a
                    href={`https://t.me/${contact.telegram_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{contact.telegram_username}
                  </a>
                )}
              </div>
            </div>
            {contact.lifecycle_stage && (
              <span className={cn(
                "text-[9px] rounded px-1.5 py-0.5 shrink-0",
                contact.lifecycle_stage === "customer" ? "bg-emerald-500/20 text-emerald-400" :
                contact.lifecycle_stage === "opportunity" ? "bg-blue-500/20 text-blue-400" :
                "bg-white/5 text-muted-foreground"
              )}>
                {contact.lifecycle_stage}
              </span>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8">
            <Users className="mx-auto h-6 w-6 text-muted-foreground/20" />
            <p className="mt-2 text-xs text-muted-foreground">
              {search ? "No contacts match your search" : "No contacts yet"}
            </p>
          </div>
        )}
      </div>

      <BottomTabBar active="more" />
    </div>
  );
}
