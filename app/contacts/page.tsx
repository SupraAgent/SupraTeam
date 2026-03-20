"use client";

import * as React from "react";
import { ContactTable } from "@/components/contacts/contact-table";
import { CreateContactModal } from "@/components/contacts/create-contact-modal";
import { ContactDetailPanel } from "@/components/contacts/contact-detail-panel";
import { ImportTelegramModal } from "@/components/contacts/import-telegram-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload, Users, MessageCircle, Building2, ArrowUpDown, Trash2 } from "lucide-react";
import type { Contact, PipelineStage, Deal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SortKey = "name" | "company" | "created_at" | "deals";
type SortDir = "asc" | "desc";

export default function ContactsPage() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [search, setSearch] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState<string>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      const [contactsRes, stagesRes, dealsRes] = await Promise.all([
        fetch("/api/contacts"),
        fetch("/api/pipeline"),
        fetch("/api/deals"),
      ]);
      if (contactsRes.ok) {
        const { contacts } = await contactsRes.json();
        setContacts(contacts);
      }
      if (stagesRes.ok) {
        const { stages } = await stagesRes.json();
        setStages(stages);
      }
      if (dealsRes.ok) {
        const data = await dealsRes.json();
        setDeals(data.deals ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Deal counts per contact
  const dealCountMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of deals) {
      if (d.contact_id) map[d.contact_id] = (map[d.contact_id] ?? 0) + 1;
    }
    return map;
  }, [deals]);

  const filtered = contacts.filter((c) => {
    if (stageFilter === "unassigned" && c.stage_id) return false;
    if (stageFilter !== "all" && stageFilter !== "unassigned" && c.stage_id !== stageFilter) return false;
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

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "company": cmp = (a.company ?? "").localeCompare(b.company ?? ""); break;
      case "created_at": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      case "deals": cmp = (dealCountMap[a.id] ?? 0) - (dealCountMap[b.id] ?? 0); break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((c) => c.id)));
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} contact(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of selected) {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (res.ok) deleted++;
    }
    toast.success(`Deleted ${deleted} contact(s)`);
    setSelected(new Set());
    setBulkDeleting(false);
    fetchData();
  }

  // Stats
  const withTg = contacts.filter((c) => c.telegram_username).length;
  const withDeals = new Set(deals.filter((d) => d.contact_id).map((d) => d.contact_id)).size;
  const withCompany = contacts.filter((c) => c.company).length;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} in database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/contacts/export" className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/[0.06] transition">
            <Upload className="h-3 w-3" /> Export CSV
          </a>
          <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
            <Download className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import from Telegram</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <Users className="mx-auto h-4 w-4 text-blue-400" />
          <p className="mt-1 text-lg font-semibold text-foreground">{contacts.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Contacts</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <MessageCircle className="mx-auto h-4 w-4 text-primary" />
          <p className="mt-1 text-lg font-semibold text-foreground">{withTg}</p>
          <p className="text-[10px] text-muted-foreground">With Telegram</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <Building2 className="mx-auto h-4 w-4 text-purple-400" />
          <p className="mt-1 text-lg font-semibold text-foreground">{withCompany}</p>
          <p className="text-[10px] text-muted-foreground">With Company</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
          <ArrowUpDown className="mx-auto h-4 w-4 text-green-400" />
          <p className="mt-1 text-lg font-semibold text-foreground">{withDeals}</p>
          <p className="text-[10px] text-muted-foreground">Linked to Deals</p>
        </div>
      </div>

      {/* Stage filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
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

        {/* Sort controls */}
        <div className="flex gap-1 ml-auto">
          {([["name", "Name"], ["company", "Company"], ["created_at", "Date"], ["deals", "Deals"]] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={cn(
                "rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
                sortKey === key ? "bg-white/10 text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
              )}
            >
              {label} {sortKey === key && (sortDir === "asc" ? "↑" : "↓")}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2">
          <span className="text-xs text-foreground font-medium">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-xs">
            Clear
          </Button>
          <Button size="sm" variant="outline" onClick={bulkDelete} disabled={bulkDeleting} className="text-xs text-red-400 border-red-500/20 hover:bg-red-500/10">
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}

      <ContactTable
        contacts={sorted}
        onRowClick={setSelectedContact}
        dealCountMap={dealCountMap}
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
      />

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
        onUpdated={fetchData}
      />
    </div>
  );
}
