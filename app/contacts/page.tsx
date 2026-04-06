"use client";

import * as React from "react";
import { ContactTable } from "@/components/contacts/contact-table";
import { CreateContactModal } from "@/components/contacts/create-contact-modal";
import { ContactDetailPanel } from "@/components/contacts/contact-detail-panel";
import { ImportTelegramModal } from "@/components/contacts/import-telegram-modal";
import { BulkXImportModal } from "@/components/contacts/bulk-x-import-modal";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload, Users, MessageCircle, Building2, ArrowUpDown, Trash2, Filter, GitMerge, Sparkles, AlertTriangle, Twitter, Wallet, RefreshCw, Loader2 } from "lucide-react";
import { MergePreviewModal } from "@/components/contacts/merge-preview-modal";
import type { Contact, PipelineStage, Deal, LifecycleStage, DecisionMakerLevel, PartnershipType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runEnrichmentPipeline } from "@/lib/enrichment/pipeline";
import { isDesktop } from "@/lib/platform";
import { getCacheStore } from "@/lib/cache";

type SortKey = "name" | "company" | "created_at" | "deals" | "quality_score";
type SortDir = "asc" | "desc";

const LIFECYCLE_STAGES: { value: LifecycleStage; label: string; color: string }[] = [
  { value: "prospect", label: "Prospect", color: "bg-slate-500/20 text-slate-400" },
  { value: "lead", label: "Lead", color: "bg-blue-500/20 text-blue-400" },
  { value: "opportunity", label: "Opportunity", color: "bg-amber-500/20 text-amber-400" },
  { value: "customer", label: "Customer", color: "bg-green-500/20 text-green-400" },
  { value: "churned", label: "Churned", color: "bg-red-500/20 text-red-400" },
  { value: "inactive", label: "Inactive", color: "bg-gray-500/20 text-gray-400" },
];

export { LIFECYCLE_STAGES };

export default function ContactsPage() {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [search, setSearch] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState<string>("all");
  const [lifecycleFilter, setLifecycleFilter] = React.useState<string>("all");
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [companyFilter, setCompanyFilter] = React.useState<string>("all"); // "all" | "linked" | "unlinked"
  const [filterHasEmail, setFilterHasEmail] = React.useState(false);
  const [filterHasTg, setFilterHasTg] = React.useState(false);
  const [filterHasDeals, setFilterHasDeals] = React.useState(false);
  const [filterHasWallet, setFilterHasWallet] = React.useState(false);
  const [decisionMakerFilter, setDecisionMakerFilter] = React.useState<DecisionMakerLevel | "all">("all");
  const [partnershipFilter, setPartnershipFilter] = React.useState<PartnershipType | "all">("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [bulkXOpen, setBulkXOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [totalContacts, setTotalContacts] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const PAGE_SIZE = 50;

  // Duplicate scanner
  type DupGroup = { contacts: { id: string; name: string; email: string | null; phone: string | null; telegram_username: string | null; company: string | null; title: string | null }[]; reason: string; confidence: number; signals: string[] };
  const [showDupes, setShowDupes] = React.useState(false);
  const [dupeGroups, setDupeGroups] = React.useState<DupGroup[]>([]);
  const [scanningDupes, setScanningDupes] = React.useState(false);
  const [mergingId, setMergingId] = React.useState<string | null>(null);
  const [mergePreviewGroup, setMergePreviewGroup] = React.useState<DupGroup | null>(null);
  const [enrichingIds, setEnrichingIds] = React.useState<Set<string>>(new Set());
  const [bulkEnriching, setBulkEnriching] = React.useState(false);

  // ── Desktop cache: instant load from SQLite, then sync from network ──
  React.useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    (async () => {
      try {
        const store = await getCacheStore();
        const [cachedContacts, cachedDeals] = await Promise.all([
          store.getAllContacts(),
          store.getAllDeals(),
        ]);
        if (cancelled) return;
        // Validate cached data has required fields before using
        const validContacts = cachedContacts.filter(
          (c): c is Contact & Record<string, unknown> =>
            typeof c.id === "string" && typeof (c as Record<string, unknown>).name === "string"
        ) as unknown as Contact[];
        if (validContacts.length > 0) {
          setContacts(validContacts);
          setTotalContacts(validContacts.length);
          setLoading(false);
        }
        const validDeals = cachedDeals.filter(
          (d): d is Deal & Record<string, unknown> =>
            typeof d.id === "string" && typeof (d as Record<string, unknown>).deal_name === "string"
        ) as unknown as Deal[];
        if (validDeals.length > 0) {
          setDeals(validDeals);
        }
      } catch {
        // Cache read failed — network fetch will handle it
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchData = React.useCallback(async () => {
    try {
      const [contactsRes, stagesRes, dealsRes] = await Promise.all([
        fetch(`/api/contacts?limit=${PAGE_SIZE}&offset=0`),
        fetch("/api/pipeline"),
        fetch("/api/deals"),
      ]);
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        const fetchedContacts = data.contacts ?? [];
        setContacts(fetchedContacts);
        setTotalContacts(data.total ?? 0);
        // Write to desktop cache for next instant load
        if (isDesktop) {
          getCacheStore()
            .then((store) => store.storeContacts(fetchedContacts as unknown as import("@/lib/cache").ContactRecord[]))
            .catch((err) => console.error("[desktop-cache] Failed to write contacts:", err));
        }
      }
      if (stagesRes.ok) {
        const { stages } = await stagesRes.json();
        setStages(stages);
      }
      if (dealsRes.ok) {
        const data = await dealsRes.json();
        const fetchedDeals = data.deals ?? [];
        setDeals(fetchedDeals);
        if (isDesktop) {
          getCacheStore()
            .then((store) => store.storeDeals(fetchedDeals as unknown as import("@/lib/cache").DealRecord[]))
            .catch((err) => console.error("[desktop-cache] Failed to write deals:", err));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadMoreContacts() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(contacts.length),
      });
      if (search) params.set("search", search);
      if (stageFilter && stageFilter !== "all") params.set("stage", stageFilter);
      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContacts((prev) => [...prev, ...(data.contacts ?? [])]);
        setTotalContacts(data.total ?? 0);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  React.useEffect(() => {
    fetchData();
    // Auto-scan for duplicates in background on page load
    fetch("/api/contacts/scan-duplicates")
      .then((r) => r.json())
      .then((data) => setDupeGroups(data.groups ?? []))
      .catch(() => {});
  }, [fetchData]);

  // Deal counts per contact
  const dealCountMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of deals) {
      if (d.contact_id) map[d.contact_id] = (map[d.contact_id] ?? 0) + 1;
    }
    return map;
  }, [deals]);

  // Contact quality score calculation (client-side, based on data completeness)
  const contactsWithScore = React.useMemo(() => {
    return contacts.map((c) => {
      let score = c.quality_score || 0;
      if (score === 0) {
        // Auto-calculate based on data completeness
        if (c.name) score += 15;
        if (c.email) score += 20;
        if (c.telegram_username) score += 20;
        if (c.company) score += 15;
        if (c.phone) score += 10;
        if (c.title) score += 10;
        if (dealCountMap[c.id]) score += 10;
      }
      return { ...c, quality_score: score };
    });
  }, [contacts, dealCountMap]);

  const filtered = contactsWithScore.filter((c) => {
    if (stageFilter === "unassigned" && c.stage_id) return false;
    if (stageFilter !== "all" && stageFilter !== "unassigned" && c.stage_id !== stageFilter) return false;
    if (lifecycleFilter !== "all" && c.lifecycle_stage !== lifecycleFilter) return false;
    if (companyFilter === "linked" && !c.company_id) return false;
    if (companyFilter === "unlinked" && c.company_id) return false;
    if (filterHasEmail && !c.email) return false;
    if (filterHasTg && !c.telegram_username) return false;
    if (filterHasDeals && !dealCountMap[c.id]) return false;
    if (filterHasWallet && (!c.wallets || c.wallets.length === 0) && !c.wallet_address) return false;
    if (decisionMakerFilter !== "all" && c.decision_maker_level !== decisionMakerFilter) return false;
    if (partnershipFilter !== "all" && c.partnership_type !== partnershipFilter) return false;
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
      case "quality_score": cmp = a.quality_score - b.quality_score; break;
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

  async function bulkLifecycle(lifecycle: LifecycleStage) {
    const ids = Array.from(selected);
    const res = await fetch("/api/contacts/bulk-update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, updates: { lifecycle_stage: lifecycle } }),
    });
    if (res.ok) {
      toast.success(`Updated ${ids.length} contact(s) to ${lifecycle}`);
      setSelected(new Set());
      fetchData();
    } else {
      toast.error("Failed to update");
    }
  }

  async function bulkStage(stageId: string) {
    const ids = Array.from(selected);
    const res = await fetch("/api/contacts/bulk-update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, updates: { stage_id: stageId || null } }),
    });
    if (res.ok) {
      toast.success(`Updated ${ids.length} contact(s)`);
      setSelected(new Set());
      fetchData();
    } else {
      toast.error("Failed to update");
    }
  }

  async function scanDuplicates() {
    setScanningDupes(true);
    setShowDupes(true);
    try {
      const res = await fetch("/api/contacts/scan-duplicates");
      if (res.ok) {
        const data = await res.json();
        setDupeGroups(data.groups ?? []);
      }
    } finally {
      setScanningDupes(false);
    }
  }

  async function mergeDupeGroup(group: DupGroup) {
    const primary = group.contacts[0];
    const mergeIds = group.contacts.slice(1).map((c) => c.id);
    setMergingId(primary.id);
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId: primary.id, mergeIds }),
      });
      if (res.ok) {
        toast.success(`Merged ${group.contacts.length} contacts into ${primary.name}`);
        setDupeGroups((prev) => prev.filter((g) => g !== group));
        fetchData();
      } else {
        toast.error("Merge failed");
      }
    } finally {
      setMergingId(null);
    }
  }

  async function enrichSingleContact(contact: Contact) {
    setEnrichingIds((prev) => new Set(prev).add(contact.id));
    try {
      const result = await runEnrichmentPipeline({ contactId: contact.id, includeAI: true });
      const sources: string[] = [];
      if (result.x.ok) sources.push("X");
      if (result.onChain.ok) sources.push("on-chain");
      if (result.ai?.ok) sources.push("AI");
      if (sources.length > 0) {
        toast.success(`Enriched ${contact.name}: ${sources.join(", ")}`);
      } else {
        const errors = [result.x.error, result.onChain.error, result.ai?.error].filter(Boolean);
        if (errors.length > 0) {
          toast.error(`Enrichment failed: ${errors[0]}`);
        } else {
          toast.info(`No enrichment sources available for ${contact.name}`);
        }
      }
      fetchData();
    } catch {
      toast.error(`Failed to enrich ${contact.name}`);
    } finally {
      setEnrichingIds((prev) => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
    }
  }

  async function enrichAllContacts() {
    const enrichable = contacts.filter((c) => c.x_handle || c.telegram_user_id);
    if (enrichable.length === 0) {
      toast.info("No contacts have X handle or Telegram ID for enrichment");
      return;
    }
    setSelected(new Set(enrichable.map((c) => c.id)));
    setBulkEnriching(true);
    let enriched = 0;
    let errored = 0;
    for (const contact of enrichable) {
      setEnrichingIds((prev) => new Set(prev).add(contact.id));
      try {
        const result = await runEnrichmentPipeline({ contactId: contact.id, includeAI: true });
        if (result.x.ok || result.onChain.ok || result.ai?.ok) enriched++;
        if (!result.x.ok && !result.onChain.ok) errored++;
      } catch {
        errored++;
      } finally {
        setEnrichingIds((prev) => {
          const next = new Set(prev);
          next.delete(contact.id);
          return next;
        });
      }
    }
    setBulkEnriching(false);
    if (enriched > 0) toast.success(`Enriched ${enriched} contact(s)`);
    if (errored > 0) toast.error(`${errored} contact(s) had enrichment errors`);
    setSelected(new Set());
    fetchData();
  }

  async function bulkEnrich() {
    const ids = Array.from(selected);
    const targets = contacts.filter((c) => ids.includes(c.id) && (c.x_handle || c.telegram_user_id));
    if (targets.length === 0) {
      toast.info("No selected contacts have X handle or Telegram ID for enrichment");
      return;
    }
    setBulkEnriching(true);
    let enriched = 0;
    let errored = 0;
    for (const contact of targets) {
      setEnrichingIds((prev) => new Set(prev).add(contact.id));
      try {
        const result = await runEnrichmentPipeline({ contactId: contact.id, includeAI: true });
        if (result.x.ok || result.onChain.ok || result.ai?.ok) enriched++;
        if (!result.x.ok && !result.onChain.ok) errored++;
      } catch {
        errored++;
      } finally {
        setEnrichingIds((prev) => {
          const next = new Set(prev);
          next.delete(contact.id);
          return next;
        });
      }
    }
    setBulkEnriching(false);
    if (enriched > 0) toast.success(`Enriched ${enriched} contact(s)`);
    if (errored > 0) toast.error(`${errored} contact(s) had enrichment errors`);
    setSelected(new Set());
    fetchData();
  }

  // Stats
  const withTg = contacts.filter((c) => c.telegram_username).length;
  const withDeals = new Set(deals.filter((d) => d.contact_id).map((d) => d.contact_id)).size;
  const withCompany = contacts.filter((c) => c.company).length;

  // Lifecycle counts
  const lifecycleCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contactsWithScore) {
      const lc = c.lifecycle_stage || "prospect";
      counts[lc] = (counts[lc] ?? 0) + 1;
    }
    return counts;
  }, [contactsWithScore]);

  const hasAdvancedFilters = filterHasEmail || filterHasTg || filterHasDeals || filterHasWallet || decisionMakerFilter !== "all" || partnershipFilter !== "all" || lifecycleFilter !== "all" || companyFilter !== "all";

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
          <Button size="sm" variant="ghost" onClick={scanDuplicates} disabled={scanningDupes}>
            <GitMerge className="mr-1 h-3.5 w-3.5" />
            {scanningDupes ? "Scanning..." : "Find Duplicates"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBulkXOpen(true)}>
            <Twitter className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bulk X Import</span>
            <span className="sm:hidden">X Import</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={enrichAllContacts}
            disabled={bulkEnriching}
          >
            {bulkEnriching ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{bulkEnriching ? "Enriching..." : "Enrich All"}</span>
            <span className="sm:hidden">Enrich</span>
          </Button>
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
          <p className="mt-1 text-lg font-semibold text-foreground">{totalContacts || contacts.length}</p>
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
        {dupeGroups.length > 0 && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-center cursor-pointer hover:bg-amber-500/10 transition-colors" onClick={() => setShowDupes(true)}>
            <AlertTriangle className="mx-auto h-4 w-4 text-amber-400" />
            <p className="mt-1 text-lg font-semibold text-amber-400">{dupeGroups.length}</p>
            <p className="text-[10px] text-muted-foreground">Duplicate Groups</p>
          </div>
        )}
      </div>

      {/* Lifecycle stage tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setLifecycleFilter("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              lifecycleFilter === "all" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
            )}
          >
            All
          </button>
          {LIFECYCLE_STAGES.map((ls) => (
            <button
              key={ls.value}
              onClick={() => setLifecycleFilter(ls.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                lifecycleFilter === ls.value ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
              )}
            >
              {ls.label}
              {lifecycleCounts[ls.value] ? (
                <span className="ml-1 text-muted-foreground/60">({lifecycleCounts[ls.value]})</span>
              ) : null}
            </button>
          ))}
        </div>
        <span className="text-white/10">|</span>
        <div className="flex gap-1">
          {([
            { value: "all", label: "All" },
            { value: "linked", label: "Company" },
            { value: "unlinked", label: "Personal" },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCompanyFilter(opt.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                companyFilter === opt.value ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline stage + search + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setStageFilter("all")}
            className={cn(
              "rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
              stageFilter === "all" ? "bg-white/10 text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            All stages
          </button>
          {stages.map((stage) => {
            const count = contactsWithScore.filter((c) => c.stage_id === stage.id).length;
            return (
              <button
                key={stage.id}
                onClick={() => setStageFilter(stage.id)}
                className={cn(
                  "rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
                  stageFilter === stage.id ? "bg-white/10 text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                {stage.name}
                {count > 0 && <span className="ml-0.5 text-muted-foreground/40">({count})</span>}
              </button>
            );
          })}
          <button
            onClick={() => setStageFilter("unassigned")}
            className={cn(
              "rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
              stageFilter === "unassigned" ? "bg-white/10 text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            No Stage
          </button>
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(
            "rounded-lg p-1.5 transition-colors",
            showAdvanced || hasAdvancedFilters ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-white/5"
          )}
          title="Advanced filters"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="max-w-[200px] h-8 text-xs"
        />

        {/* Sort controls */}
        <div className="flex gap-1 ml-auto">
          {([["name", "Name"], ["company", "Company"], ["created_at", "Date"], ["deals", "Deals"], ["quality_score", "Score"]] as [SortKey, string][]).map(([key, label]) => (
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

      {/* Saved views */}
      <SavedViewsBar
        page="contacts"
        currentFilters={{ stageFilter, lifecycleFilter, filterHasEmail, filterHasTg, filterHasDeals, filterHasWallet, decisionMakerFilter, partnershipFilter }}
        onApplyView={(f) => {
          const v = f as Record<string, unknown>;
          setStageFilter((v.stageFilter as string) ?? "all");
          setLifecycleFilter((v.lifecycleFilter as string) ?? "all");
          setFilterHasEmail(!!v.filterHasEmail);
          setFilterHasTg(!!v.filterHasTg);
          setFilterHasDeals(!!v.filterHasDeals);
          setFilterHasWallet(!!v.filterHasWallet);
          setDecisionMakerFilter((v.decisionMakerFilter as DecisionMakerLevel | "all") ?? "all");
          setPartnershipFilter((v.partnershipFilter as PartnershipType | "all") ?? "all");
        }}
      />

      {/* Advanced filter bar */}
      {showAdvanced && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 flex items-center gap-4 flex-wrap">
          <span className="text-xs text-muted-foreground">Show only:</span>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={filterHasEmail} onChange={(e) => setFilterHasEmail(e.target.checked)} className="rounded border-white/20" />
            Has email
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={filterHasTg} onChange={(e) => setFilterHasTg(e.target.checked)} className="rounded border-white/20" />
            Has Telegram
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={filterHasDeals} onChange={(e) => setFilterHasDeals(e.target.checked)} className="rounded border-white/20" />
            Has deals
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={filterHasWallet} onChange={(e) => setFilterHasWallet(e.target.checked)} className="rounded border-white/20" />
            <Wallet className="h-3 w-3" /> Has wallet
          </label>
          <span className="text-white/10">|</span>
          <select
            value={decisionMakerFilter}
            onChange={(e) => setDecisionMakerFilter(e.target.value as DecisionMakerLevel | "all")}
            className="h-6 rounded border border-white/10 bg-white/5 px-1.5 text-[10px] text-foreground outline-none"
          >
            <option value="all">All roles</option>
            <option value="founder">Founder</option>
            <option value="c_level">C-Level</option>
            <option value="vp">VP</option>
            <option value="director">Director</option>
            <option value="manager">Manager</option>
            <option value="ic">IC</option>
          </select>
          <select
            value={partnershipFilter}
            onChange={(e) => setPartnershipFilter(e.target.value as PartnershipType | "all")}
            className="h-6 rounded border border-white/10 bg-white/5 px-1.5 text-[10px] text-foreground outline-none"
          >
            <option value="all">All partnerships</option>
            <option value="integration">Integration</option>
            <option value="listing">Listing</option>
            <option value="co_marketing">Co-Marketing</option>
            <option value="investment">Investment</option>
            <option value="advisory">Advisory</option>
            <option value="node_operator">Node Operator</option>
          </select>
          {hasAdvancedFilters && (
            <button
              onClick={() => { setFilterHasEmail(false); setFilterHasTg(false); setFilterHasDeals(false); setFilterHasWallet(false); setDecisionMakerFilter("all"); setPartnershipFilter("all"); setLifecycleFilter("all"); }}
              className="text-xs text-primary hover:text-primary/80 ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 flex-wrap">
          <span className="text-xs text-foreground font-medium">{selected.size} selected</span>

          {/* Lifecycle bulk change */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Lifecycle:</span>
            {LIFECYCLE_STAGES.slice(0, 4).map((ls) => (
              <button
                key={ls.value}
                onClick={() => bulkLifecycle(ls.value)}
                className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:brightness-125", ls.color)}
              >
                {ls.label}
              </button>
            ))}
          </div>

          {/* Stage bulk change */}
          <select
            onChange={(e) => { if (e.target.value) bulkStage(e.target.value); e.target.value = ""; }}
            className="h-6 rounded border border-white/10 bg-white/5 px-1.5 text-[10px] text-foreground outline-none appearance-none"
          >
            <option value="">Move to stage...</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="flex items-center gap-1 ml-auto">
            <Button size="sm" variant="ghost" onClick={bulkEnrich} disabled={bulkEnriching} className="h-6 text-[10px]">
              {bulkEnriching ? <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5 mr-0.5" />}
              {bulkEnriching ? "Enriching..." : "Enrich"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-6 text-[10px]">
              Clear
            </Button>
            <Button size="sm" variant="outline" onClick={bulkDelete} disabled={bulkDeleting} className="h-6 text-[10px] text-red-400 border-red-500/20 hover:bg-red-500/10">
              <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Delete
            </Button>
          </div>
        </div>
      )}

      {/* Duplicate scanner results */}
      {showDupes && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-foreground">
                {scanningDupes ? "Scanning..." : `${dupeGroups.length} duplicate group${dupeGroups.length !== 1 ? "s" : ""} found`}
              </span>
            </div>
            <button onClick={() => setShowDupes(false)} className="text-xs text-muted-foreground hover:text-foreground">
              Close
            </button>
          </div>

          {!scanningDupes && dupeGroups.length === 0 && (
            <p className="text-xs text-muted-foreground">No duplicates detected. Your contact database is clean.</p>
          )}

          {dupeGroups.map((group, gi) => (
            <div key={gi} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    group.confidence >= 80 ? "bg-red-500/20 text-red-400" :
                    group.confidence >= 60 ? "bg-amber-500/20 text-amber-400" :
                    "bg-blue-500/20 text-blue-400"
                  )}>
                    {group.confidence}% match
                  </span>
                  <span className="text-[10px] text-muted-foreground">{group.reason}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setMergePreviewGroup(group)}
                    className="h-6 text-[10px] text-foreground"
                  >
                    Review
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => mergeDupeGroup(group)}
                    disabled={mergingId === group.contacts[0].id}
                    className="h-6 text-[10px] text-primary"
                  >
                    <GitMerge className="h-3 w-3 mr-0.5" />
                    {mergingId === group.contacts[0].id ? "Merging..." : "Quick Merge"}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                {group.contacts.map((c, ci) => (
                  <div key={c.id} className="flex items-center gap-3 text-xs">
                    {ci === 0 && <span className="text-[9px] text-green-400 font-medium w-12">Primary</span>}
                    {ci > 0 && <span className="text-[9px] text-muted-foreground/40 w-12">Merge</span>}
                    <span className="text-foreground font-medium">{c.name}</span>
                    {c.email && <span className="text-muted-foreground">{c.email}</span>}
                    {c.telegram_username && <span className="text-primary">@{c.telegram_username}</span>}
                    {c.company && <span className="text-muted-foreground/50">{c.company}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ContactTable
        contacts={sorted}
        onRowClick={setSelectedContact}
        dealCountMap={dealCountMap}
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        enrichingIds={enrichingIds}
        onEnrich={enrichSingleContact}
      />

      {contacts.length < totalContacts && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMoreContacts}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : `Load more (${contacts.length} of ${totalContacts})`}
          </Button>
        </div>
      )}

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

      <BulkXImportModal
        open={bulkXOpen}
        onClose={() => setBulkXOpen(false)}
        onImported={fetchData}
      />

      <ContactDetailPanel
        contact={selectedContact}
        open={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        onDeleted={fetchData}
        onUpdated={fetchData}
        allContacts={contacts}
      />

      {mergePreviewGroup && (
        <MergePreviewModal
          open={!!mergePreviewGroup}
          onClose={() => setMergePreviewGroup(null)}
          contacts={mergePreviewGroup.contacts}
          confidence={mergePreviewGroup.confidence}
          signals={mergePreviewGroup.signals ?? []}
          onMerged={() => {
            setDupeGroups((prev) => prev.filter((g) => g !== mergePreviewGroup));
            setMergePreviewGroup(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
