"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { Contact, Company, PipelineStage, LifecycleStage, ContactSource } from "@/lib/types";
import { timeAgo, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Save, Trash2, MessageCircle, FileText, GitMerge, AlertTriangle, Twitter, Loader2, ChevronDown, ChevronRight, RefreshCw, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { runEnrichmentPipeline } from "@/lib/enrichment/pipeline";

const LIFECYCLE_OPTIONS: { value: LifecycleStage; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "lead", label: "Lead" },
  { value: "opportunity", label: "Opportunity" },
  { value: "customer", label: "Customer" },
  { value: "churned", label: "Churned" },
  { value: "inactive", label: "Inactive" },
];

const SOURCE_OPTIONS: { value: ContactSource; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "telegram_import", label: "Telegram Import" },
  { value: "telegram_bot", label: "Telegram Bot" },
  { value: "csv_import", label: "CSV Import" },
  { value: "referral", label: "Referral" },
  { value: "event", label: "Event" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
];

type Duplicate = { id: string; name: string; email: string | null; company: string | null; telegram_username: string | null; phone: string | null; title: string | null; confidence: number; signals: string[] };

type ContactDetailPanelProps = {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated?: () => void;
  allContacts?: Contact[];
};

export function ContactDetailPanel({ contact, open, onClose, onDeleted, onUpdated, allContacts }: ContactDetailPanelProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [companySuggestions, setCompanySuggestions] = React.useState<Company[]>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = React.useState(false);
  const companyDropdownRef = React.useRef<HTMLDivElement>(null);
  const [title, setTitle] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [telegram, setTelegram] = React.useState("");
  const [xHandle, setXHandle] = React.useState("");
  const [walletAddress, setWalletAddress] = React.useState("");
  const [walletChain, setWalletChain] = React.useState("supra");
  const [stageId, setStageId] = React.useState("");
  const [lifecycle, setLifecycle] = React.useState<LifecycleStage>("prospect");
  const [source, setSource] = React.useState<ContactSource>("manual");
  const [notes, setNotes] = React.useState("");
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [linkedDocs, setLinkedDocs] = React.useState<{ id: string; title: string; updated_at: string }[]>([]);

  // Duplicate detection
  const [duplicates, setDuplicates] = React.useState<Duplicate[]>([]);
  const [merging, setMerging] = React.useState(false);

  // Custom fields
  type CField = { id: string; label: string; field_type: string; options: string[] | null; required: boolean };
  const [customFields, setCustomFields] = React.useState<CField[]>([]);
  const [customValues, setCustomValues] = React.useState<Record<string, string>>({});

  // Enrichment state
  const [enrichingX, setEnrichingX] = React.useState(false);
  const [xEnrichData, setXEnrichData] = React.useState<{ x_bio: string | null; x_followers: number | null; enriched_at: string | null } | null>(null);
  const [calculatingScore, setCalculatingScore] = React.useState(false);
  const [displayScore, setDisplayScore] = React.useState<number>(0);
  const [runningFullEnrich, setRunningFullEnrich] = React.useState(false);

  // Enrichment history
  type EnrichmentLogEntry = { id: string; field_name: string; old_value: string | null; new_value: string | null; source: string; created_at: string };
  const [enrichHistory, setEnrichHistory] = React.useState<EnrichmentLogEntry[]>([]);
  const [enrichHistoryOpen, setEnrichHistoryOpen] = React.useState(false);
  const [enrichHistoryLoaded, setEnrichHistoryLoaded] = React.useState(false);
  const [showAllHistory, setShowAllHistory] = React.useState(false);

  React.useEffect(() => {
    if (contact && open) {
      setName(contact.name);
      setCompany(contact.company ?? "");
      setCompanyId(contact.company_id ?? null);
      companyUserEdited.current = false;
      setTitle(contact.title ?? "");
      setEmail(contact.email ?? "");
      setPhone(contact.phone ?? "");
      setTelegram(contact.telegram_username ?? "");
      setXHandle(contact.x_handle ?? "");
      setWalletAddress(contact.wallet_address ?? "");
      setWalletChain(contact.wallet_chain ?? "supra");
      setStageId(contact.stage_id ?? "");
      setLifecycle(contact.lifecycle_stage ?? "prospect");
      setSource(contact.source ?? "manual");
      setNotes(contact.notes ?? "");

      // Set enrichment display data from contact
      setXEnrichData(
        contact.enriched_at
          ? { x_bio: contact.x_bio, x_followers: contact.x_followers, enriched_at: contact.enriched_at }
          : null
      );
      setDisplayScore(contact.on_chain_score ?? 0);
      setEnrichHistoryOpen(false);
      setEnrichHistoryLoaded(false);
      setShowAllHistory(false);

      fetch("/api/pipeline").then((r) => r.json()).then((d) => setStages(d.stages ?? [])).catch(() => {});
      fetch(`/api/docs?entity_type=contact&entity_id=${contact.id}`).then((r) => r.json()).then((d) => setLinkedDocs(d.docs ?? [])).catch(() => setLinkedDocs([]));
      fetch("/api/contacts/fields").then((r) => r.json()).then((d) => setCustomFields(d.fields ?? [])).catch(() => {});
      fetch(`/api/contacts/${contact.id}`).then((r) => r.json()).then((d) => setCustomValues(d.custom_fields ?? {})).catch(() => {});

      // Find duplicates
      const params = new URLSearchParams({ exclude: contact.id });
      if (contact.name) params.set("name", contact.name);
      if (contact.email) params.set("email", contact.email);
      if (contact.telegram_username) params.set("telegram", contact.telegram_username);
      fetch(`/api/contacts/duplicates?${params}`)
        .then((r) => r.json())
        .then((d) => setDuplicates(d.duplicates ?? []))
        .catch(() => setDuplicates([]));
    }
  }, [contact, open]);

  // Company autocomplete (skip initial load from contact data)
  const companyUserEdited = React.useRef(false);
  React.useEffect(() => {
    if (!companyUserEdited.current) return;
    if (!company || company.length < 2) { setCompanySuggestions([]); return; }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/companies?search=${encodeURIComponent(company)}`);
      if (res.ok) {
        const data = await res.json();
        setCompanySuggestions(data.companies ?? []);
        setShowCompanyDropdown(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [company]);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node)) {
        setShowCompanyDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!contact) return null;

  async function handleSave() {
    if (!contact) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company: company || null,
          company_id: companyId,
          title: title || null,
          email: email || null,
          phone: phone || null,
          telegram_username: telegram || null,
          x_handle: xHandle || null,
          wallet_address: walletAddress || null,
          wallet_chain: walletChain || null,
          stage_id: stageId || null,
          lifecycle_stage: lifecycle,
          source,
          notes: notes || null,
          custom_fields: customValues,
        }),
      });
      if (res.ok) {
        toast.success("Contact updated");
        onUpdated?.();
      } else {
        toast.error("Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!contact) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Contact deleted");
        onDeleted();
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleMerge(duplicateId: string) {
    if (!contact) return;
    setMerging(true);
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId: contact.id, mergeIds: [duplicateId] }),
      });
      if (res.ok) {
        toast.success("Contacts merged");
        setDuplicates((prev) => prev.filter((d) => d.id !== duplicateId));
        onUpdated?.();
      } else {
        toast.error("Merge failed");
      }
    } finally {
      setMerging(false);
    }
  }

  function formatFollowers(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  async function handleEnrichX() {
    if (!contact) return;
    setEnrichingX(true);
    try {
      const result = await runEnrichmentPipeline({
        contactId: contact.id,
        includeAI: true,
      });

      if (result.x.ok && result.x.data) {
        setXEnrichData({
          x_bio: result.x.data.x_bio,
          x_followers: result.x.data.x_followers,
          enriched_at: result.x.data.enriched_at,
        });
      }

      if (result.onChain.ok && result.onChain.data) {
        setDisplayScore(result.onChain.data.score);
      }

      // Build a user-friendly toast
      const successes: string[] = [];
      if (result.x.ok) successes.push("X");
      if (result.onChain.ok) successes.push("on-chain");
      if (result.ai?.ok) successes.push("AI");

      if (successes.length > 0) {
        toast.success(`Enriched: ${successes.join(", ")}`);
        onUpdated?.();
      } else {
        toast.error(result.x.error || "Enrichment failed");
      }
    } finally {
      setEnrichingX(false);
    }
  }

  async function handleCalculateScore() {
    if (!contact) return;
    setCalculatingScore(true);
    try {
      const res = await fetch("/api/contacts/enrich-onchain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setDisplayScore(data.score);
        toast.success(`On-chain score: ${data.score}/100`);
        onUpdated?.();
      } else {
        const data = await res.json();
        toast.error(data.error || "Score calculation failed");
      }
    } finally {
      setCalculatingScore(false);
    }
  }

  async function loadEnrichmentHistory() {
    if (!contact || enrichHistoryLoaded) return;
    try {
      const res = await fetch(`/api/contacts/${contact.id}/enrichment-log`);
      if (res.ok) {
        const data = await res.json();
        setEnrichHistory(data.logs ?? []);
      }
    } finally {
      setEnrichHistoryLoaded(true);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title={name || contact.name}>
      <div className="space-y-4">
        {/* TG + X links */}
        {(telegram || xHandle) && (
          <div className="flex gap-2">
            {telegram && (
              <a
                href={`https://t.me/${telegram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2AABEE] text-white px-4 py-2.5 text-sm font-medium transition hover:bg-[#2AABEE]/90"
              >
                <MessageCircle className="h-4 w-4" />
                Telegram
              </a>
            )}
            {xHandle && (
              <a
                href={`https://x.com/${xHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 text-foreground px-4 py-2.5 text-sm font-medium transition hover:bg-white/15"
              >
                <Twitter className="h-4 w-4" />
                X / Twitter
              </a>
            )}
          </div>
        )}

        {/* X Enrichment */}
        {xHandle && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEnrichX}
                disabled={enrichingX}
                className="h-7 text-[11px]"
              >
                {enrichingX ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                {xEnrichData ? "Re-enrich from X" : "Enrich from X"}
              </Button>
            </div>
            {xEnrichData && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1.5">
                {xEnrichData.x_bio && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{xEnrichData.x_bio}</p>
                )}
                {xEnrichData.x_followers != null && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">Followers:</span>
                    <span className="text-foreground font-medium">{formatFollowers(xEnrichData.x_followers)}</span>
                  </div>
                )}
                {xEnrichData.enriched_at && (
                  <p className="text-[10px] text-muted-foreground/50">
                    Last enriched {timeAgo(xEnrichData.enriched_at)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Duplicate warning */}
        {duplicates.length > 0 && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {duplicates.length} potential duplicate{duplicates.length !== 1 ? "s" : ""} found
            </div>
            {duplicates.map((dup) => (
              <div key={dup.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-foreground font-medium">{dup.name}</p>
                    {dup.confidence > 0 && (
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0",
                        dup.confidence >= 75 ? "bg-red-500/20 text-red-400" :
                        dup.confidence >= 50 ? "bg-amber-500/20 text-amber-400" :
                        "bg-blue-500/20 text-blue-400"
                      )}>
                        {dup.confidence}%
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {[dup.email, dup.telegram_username && `@${dup.telegram_username}`, dup.company].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleMerge(dup.id)}
                  disabled={merging}
                  className="h-6 text-[10px] text-primary shrink-0"
                >
                  <GitMerge className="h-3 w-3 mr-0.5" /> Merge
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Lifecycle + Source */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Lifecycle Stage</label>
            <Select
              value={lifecycle}
              onChange={(e) => setLifecycle(e.target.value as LifecycleStage)}
              options={LIFECYCLE_OPTIONS}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Source</label>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as ContactSource)}
              options={SOURCE_OPTIONS}
              className="mt-1"
            />
          </div>
        </div>

        {/* Editable fields */}
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="relative" ref={companyDropdownRef}>
            <label className="text-[11px] font-medium text-muted-foreground">Company</label>
            <Input
              value={company}
              onChange={(e) => { companyUserEdited.current = true; setCompany(e.target.value); setCompanyId(null); }}
              onFocus={() => companySuggestions.length > 0 && setShowCompanyDropdown(true)}
              placeholder="Search or type company"
              className="mt-1"
            />
            {companyId && (
              <span className="absolute right-2 top-[22px] text-[10px] text-green-400 bg-green-500/10 rounded px-1.5 py-0.5">Linked</span>
            )}
            {showCompanyDropdown && companySuggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-[hsl(var(--background))] shadow-lg max-h-40 overflow-y-auto">
                {companySuggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/[0.05] transition flex items-center justify-between"
                    onClick={() => { setCompany(c.name); setCompanyId(c.id); setShowCompanyDropdown(false); }}
                  >
                    <span className="text-foreground">{c.name}</span>
                    {c.contact_count != null && c.contact_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">{c.contact_count} contact{c.contact_count !== 1 ? "s" : ""}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Telegram Username</label>
          <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="without @" className="mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">X / Twitter</label>
            <Input value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="handle (without @)" className="mt-1" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Wallet Address</label>
            <Input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x... or supra1..." className="mt-1" />
          </div>
        </div>

        {/* On-chain score display */}
        {(displayScore > 0 || walletAddress) && (
          <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-[11px] text-muted-foreground">On-Chain Score</span>
            <div className="flex items-center gap-2">
              {displayScore > 0 && (
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  displayScore >= 70 ? "bg-emerald-500/20 text-emerald-400" :
                  displayScore >= 40 ? "bg-amber-500/20 text-amber-400" :
                  "bg-slate-500/20 text-slate-400"
                )}>
                  {displayScore}/100
                </span>
              )}
              {walletAddress && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCalculateScore}
                  disabled={calculatingScore}
                  className="h-6 text-[10px] px-2"
                >
                  {calculatingScore ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wallet className="h-3 w-3" />
                  )}
                  <span className="ml-1">{displayScore > 0 ? "Recalculate" : "Calculate"}</span>
                </Button>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Pipeline Stage</label>
          <Select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="No stage"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Notes</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 min-h-[80px]" />
        </div>

        {/* Custom fields */}
        {customFields.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-white/10">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider pt-2">Custom Fields</p>
            {customFields.map((field) => (
              <div key={field.id}>
                <label className="text-[11px] font-medium text-muted-foreground">
                  {field.label}{field.required && " *"}
                </label>
                {field.field_type === "select" ? (
                  <Select
                    value={customValues[field.id] ?? ""}
                    onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
                    placeholder={`Select ${field.label.toLowerCase()}`}
                    className="mt-1"
                  />
                ) : field.field_type === "textarea" ? (
                  <Textarea
                    value={customValues[field.id] ?? ""}
                    onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.label}
                    className="mt-1 min-h-[60px]"
                  />
                ) : (
                  <Input
                    type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "url" ? "url" : "text"}
                    value={customValues[field.id] ?? ""}
                    onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.label}
                    className="mt-1"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Timestamps */}
        <div className="space-y-1 pt-2">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Created</span>
            <span className="text-foreground">{timeAgo(contact.created_at)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Updated</span>
            <span className="text-foreground">{timeAgo(contact.updated_at)}</span>
          </div>
          {contact.lifecycle_changed_at && (
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Lifecycle changed</span>
              <span className="text-foreground">{timeAgo(contact.lifecycle_changed_at)}</span>
            </div>
          )}
        </div>

        {/* Linked docs */}
        {linkedDocs.length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Linked Docs</p>
            <div className="space-y-1">
              {linkedDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/docs?edit=${doc.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition"
                >
                  <FileText className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs text-foreground truncate">{doc.title}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/40">{timeAgo(doc.updated_at)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Enrichment History */}
        <div className="pt-2">
          <button
            onClick={() => {
              const next = !enrichHistoryOpen;
              setEnrichHistoryOpen(next);
              if (next) loadEnrichmentHistory();
            }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
          >
            {enrichHistoryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Enrichment History
          </button>
          {enrichHistoryOpen && (
            <div className="mt-2 space-y-1.5">
              {!enrichHistoryLoaded && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                </div>
              )}
              {enrichHistoryLoaded && enrichHistory.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50">No enrichment history yet.</p>
              )}
              {(showAllHistory ? enrichHistory : enrichHistory.slice(0, 5)).map((entry) => (
                <div key={entry.id} className="rounded-lg bg-white/[0.02] px-2.5 py-1.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-foreground font-medium">{entry.field_name}</span>
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                      entry.source === "manual" ? "bg-blue-500/20 text-blue-400" :
                      entry.source === "x_api" ? "bg-white/10 text-foreground" :
                      entry.source === "onchain_rpc" ? "bg-emerald-500/20 text-emerald-400" :
                      "bg-slate-500/20 text-slate-400"
                    )}>
                      {entry.source}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.old_value ?? <span className="italic">empty</span>}
                    {" → "}
                    {entry.new_value ?? <span className="italic">empty</span>}
                  </p>
                  <p className="text-[9px] text-muted-foreground/40">{timeAgo(entry.created_at)}</p>
                </div>
              ))}
              {!showAllHistory && enrichHistory.length > 5 && (
                <button
                  onClick={() => setShowAllHistory(true)}
                  className="text-[10px] text-primary hover:text-primary/80"
                >
                  Show {enrichHistory.length - 5} more...
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {deleting ? "Deleting..." : "Delete"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}
