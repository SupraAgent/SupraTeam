"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, Search, Plus, X, ChevronLeft, Loader2, Pencil } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { PullToRefresh } from "@/components/tma/pull-to-refresh";
import { useTelegramWebApp } from "@/components/tma/use-telegram";
import { hapticImpact, hapticNotification } from "@/components/tma/haptic";
import { useFocusRefresh } from "@/components/tma/use-focus-refresh";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  company: string | null;
  telegram_username: string | null;
  email: string | null;
  phone: string | null;
  lifecycle_stage: string | null;
}

interface ContactFormData {
  name: string;
  telegram_username: string;
  email: string;
  phone: string;
  company: string;
  lifecycle_stage: string;
}

const LIFECYCLE_STAGES = ["prospect", "lead", "opportunity", "customer", "churned"] as const;

const emptyForm: ContactFormData = {
  name: "",
  telegram_username: "",
  email: "",
  phone: "",
  company: "",
  lifecycle_stage: "prospect",
};

export default function TMAContactsPage() {
  const searchParams = useSearchParams();
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

  // Create/Edit state
  const [showForm, setShowForm] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState<Contact | null>(null);
  const [formData, setFormData] = React.useState<ContactFormData>({ ...emptyForm });
  const [saving, setSaving] = React.useState(false);

  // Detail view
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null);

  const fetchContacts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/contacts");
      if (res.ok) {
        const d = await res.json();
        setContacts(d.contacts ?? []);
      }
    } catch {
      toast.error("Failed to load contacts");
    }
  }, []);

  useTelegramWebApp();
  useFocusRefresh(() => fetchContacts());

  // Open create modal if navigated with ?create=1
  React.useEffect(() => {
    if (searchParams.get("create") === "1") {
      setFormData({ ...emptyForm });
      setEditingContact(null);
      setShowForm(true);
    }
  }, [searchParams]);

  React.useEffect(() => {
    fetchContacts().finally(() => setLoading(false));
  }, [fetchContacts]);

  function openCreate() {
    setFormData({ ...emptyForm });
    setEditingContact(null);
    setShowForm(true);
    hapticImpact("medium");
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      telegram_username: contact.telegram_username ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      company: contact.company ?? "",
      lifecycle_stage: contact.lifecycle_stage ?? "prospect",
    });
    setShowForm(true);
    setSelectedContact(null);
    hapticImpact("light");
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const isEdit = editingContact !== null;
      const url = isEdit ? `/api/contacts/${editingContact.id}` : "/api/contacts";
      const method = isEdit ? "PATCH" : "POST";

      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        telegram_username: formData.telegram_username.trim() || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        company: formData.company.trim() || null,
        lifecycle_stage: formData.lifecycle_stage,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to save" }));
        toast.error(err.error ?? "Failed to save contact");
        return;
      }

      hapticNotification("success");
      toast.success(isEdit ? "Contact updated" : "Contact created");
      setShowForm(false);
      setEditingContact(null);
      await fetchContacts();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

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
      <PullToRefresh onRefresh={fetchContacts}>
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
          <button
            key={contact.id}
            onClick={() => { setSelectedContact(contact); hapticImpact("light"); }}
            className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 transition active:bg-white/[0.06] text-left"
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
                  <span className="text-[10px] text-primary truncate">
                    @{contact.telegram_username}
                  </span>
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
          </button>
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
      </PullToRefresh>

      {/* FAB - Create Contact */}
      <button
        onClick={openCreate}
        className="fixed right-4 bottom-24 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Contact Detail Sheet */}
      {selectedContact && !showForm && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedContact(null)} />
          <div className="relative w-full max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-[hsl(225,35%,8%)] border-t border-white/10 p-4 pb-8 space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedContact(null)} className="p-1 rounded-lg active:bg-white/10">
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </button>
              <button
                onClick={() => openEdit(selectedContact)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 active:bg-primary/20 transition"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <span className="text-base font-semibold text-muted-foreground">
                  {selectedContact.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{selectedContact.name}</p>
                {selectedContact.lifecycle_stage && (
                  <span className={cn(
                    "text-[10px] rounded px-1.5 py-0.5 inline-block mt-0.5",
                    selectedContact.lifecycle_stage === "customer" ? "bg-emerald-500/20 text-emerald-400" :
                    selectedContact.lifecycle_stage === "opportunity" ? "bg-blue-500/20 text-blue-400" :
                    "bg-white/5 text-muted-foreground"
                  )}>
                    {selectedContact.lifecycle_stage}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              {selectedContact.company && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Company</span>
                  <span className="text-foreground">{selectedContact.company}</span>
                </div>
              )}
              {selectedContact.telegram_username && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Telegram</span>
                  <a
                    href={`https://t.me/${selectedContact.telegram_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary"
                  >
                    @{selectedContact.telegram_username}
                  </a>
                </div>
              )}
              {selectedContact.email && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground">{selectedContact.email}</span>
                </div>
              )}
              {selectedContact.phone && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="text-foreground">{selectedContact.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Contact Form Sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[hsl(225,35%,8%)] border-t border-white/10 p-4 pb-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                {editingContact ? "Edit Contact" : "New Contact"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg active:bg-white/10">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
            </div>

            {/* Telegram username */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Telegram Username</label>
              <input
                value={formData.telegram_username}
                onChange={(e) => setFormData((f) => ({ ...f, telegram_username: e.target.value.replace(/^@/, "") }))}
                placeholder="username (without @)"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <input
                type="email"
                inputMode="email"
                value={formData.email}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
              <input
                type="tel"
                inputMode="tel"
                value={formData.phone}
                onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+1 234 567 890"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Company */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Company</label>
              <input
                value={formData.company}
                onChange={(e) => setFormData((f) => ({ ...f, company: e.target.value }))}
                placeholder="Company name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Lifecycle stage */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Lifecycle Stage</label>
              <div className="flex flex-wrap gap-1.5">
                {LIFECYCLE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setFormData((f) => ({ ...f, lifecycle_stage: stage }))}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs capitalize transition",
                      formData.lifecycle_stage === stage
                        ? "ring-2 ring-primary bg-white/10 text-foreground"
                        : "bg-white/5 text-muted-foreground active:bg-white/10"
                    )}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSave}
              disabled={saving || !formData.name.trim()}
              className={cn(
                "w-full rounded-xl py-3 text-sm font-semibold transition",
                saving || !formData.name.trim()
                  ? "bg-white/5 text-muted-foreground"
                  : "bg-primary text-primary-foreground active:opacity-80"
              )}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </span>
              ) : (
                editingContact ? "Update Contact" : "Create Contact"
              )}
            </button>
          </div>
        </div>
      )}

      <BottomTabBar active="more" />
    </div>
  );
}
