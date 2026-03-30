"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { Plus, Search, Building2, Users, MessageCircle, Trash2 } from "lucide-react";
import type { Company } from "@/lib/types";

interface CompanyWithCounts extends Company {
  contact_count: number;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = React.useState<CompanyWithCounts[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  // Create form
  const [newName, setNewName] = React.useState("");
  const [newDomain, setNewDomain] = React.useState("");
  const [newIndustry, setNewIndustry] = React.useState("");
  const [newWebsite, setNewWebsite] = React.useState("");
  const [newLocation, setNewLocation] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  // Detail view
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<{
    company: Company;
    contacts: { id: string; name: string; email: string | null; telegram_username: string | null; title: string | null }[];
    groups: { id: string; group_name: string; telegram_group_id: string; bot_is_admin: boolean; member_count: number | null }[];
  } | null>(null);

  const fetchCompanies = React.useCallback(async () => {
    const res = await fetch("/api/companies");
    if (res.ok) {
      const data = await res.json();
      setCompanies(data.companies ?? []);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  React.useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let stale = false;
    fetch(`/api/companies/${selectedId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!stale && data) setDetail(data); })
      .catch(() => { if (!stale) setDetail(null); });
    return () => { stale = true; };
  }, [selectedId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          domain: newDomain || null,
          industry: newIndustry || null,
          website: newWebsite || null,
          location: newLocation || null,
        }),
      });
      if (res.ok) {
        toast.success("Company created");
        setNewName(""); setNewDomain(""); setNewIndustry(""); setNewWebsite(""); setNewLocation("");
        setShowCreate(false);
        fetchCompanies();
      } else {
        toast.error("Failed to create company");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this company? Contacts and groups will be unlinked but not deleted.")) return;
    const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Company deleted");
      setSelectedId(null);
      fetchCompanies();
    } else {
      toast.error("Failed to delete company");
    }
  }

  const filtered = companies.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.domain?.toLowerCase().includes(q) || c.industry?.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-white/[0.02] animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Companies</h1>
          <p className="mt-1 text-sm text-muted-foreground">{companies.length} compan{companies.length === 1 ? "y" : "ies"}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Company
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies..."
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Company</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Industry</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Domain</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Location</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Contacts</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {search ? "No companies match your search." : "No companies yet. Add one to get started."}
                </td>
              </tr>
            ) : filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "border-b border-white/5 cursor-pointer transition hover:bg-white/[0.03]",
                  selectedId === c.id && "bg-white/[0.05]"
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.industry ?? "-"}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.domain ?? "-"}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.location ?? "-"}</td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-400">
                    {c.contact_count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selectedId && detail && (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">{detail.company.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>Close</Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(selectedId)} className="text-red-400 hover:text-red-300">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {detail.company.domain && <div><span className="text-muted-foreground">Domain:</span> <span className="text-foreground ml-1">{detail.company.domain}</span></div>}
            {detail.company.industry && <div><span className="text-muted-foreground">Industry:</span> <span className="text-foreground ml-1">{detail.company.industry}</span></div>}
            {detail.company.website && <div><span className="text-muted-foreground">Website:</span> <a href={detail.company.website} target="_blank" rel="noopener noreferrer" className="text-primary ml-1 hover:underline">{detail.company.website}</a></div>}
            {detail.company.location && <div><span className="text-muted-foreground">Location:</span> <span className="text-foreground ml-1">{detail.company.location}</span></div>}
          </div>

          {/* Linked Contacts */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-medium text-foreground">Contacts ({detail.contacts.length})</h3>
            </div>
            {detail.contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contacts linked to this company.</p>
            ) : (
              <div className="space-y-1">
                {detail.contacts.map((c) => (
                  <Link key={c.id} href="/contacts" className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition text-xs">
                    <span className="text-foreground">{c.name}</span>
                    <span className="text-muted-foreground">{c.title ?? c.email ?? (c.telegram_username ? `@${c.telegram_username}` : "")}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Linked TG Groups */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-green-400" />
              <h3 className="text-sm font-medium text-foreground">TG Groups ({detail.groups.length})</h3>
            </div>
            {detail.groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Telegram groups linked to this company.</p>
            ) : (
              <div className="space-y-1">
                {detail.groups.map((g) => (
                  <Link key={g.id} href="/groups" className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition text-xs">
                    <span className="text-foreground">{g.group_name}</span>
                    <span className="text-muted-foreground">{g.member_count ?? 0} members</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Company">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company name" className="mt-1" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Domain</label>
              <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="example.com" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Industry</label>
              <Input value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} placeholder="Blockchain, DeFi..." className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Website</label>
              <Input value={newWebsite} onChange={(e) => setNewWebsite(e.target.value)} placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="City, Country" className="mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={creating || !newName.trim()}>
              {creating ? "Creating..." : "Create Company"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
