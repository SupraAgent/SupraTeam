"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { Contact, PipelineStage, LifecycleStage, ContactSource } from "@/lib/types";
import { timeAgo, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Save, Trash2, MessageCircle, FileText, GitMerge, AlertTriangle } from "lucide-react";
import Link from "next/link";

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

type Duplicate = { id: string; name: string; email: string | null; company: string | null; telegram_username: string | null };

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
  const [title, setTitle] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [telegram, setTelegram] = React.useState("");
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

  React.useEffect(() => {
    if (contact && open) {
      setName(contact.name);
      setCompany(contact.company ?? "");
      setTitle(contact.title ?? "");
      setEmail(contact.email ?? "");
      setPhone(contact.phone ?? "");
      setTelegram(contact.telegram_username ?? "");
      setStageId(contact.stage_id ?? "");
      setLifecycle(contact.lifecycle_stage ?? "prospect");
      setSource(contact.source ?? "manual");
      setNotes(contact.notes ?? "");

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
          title: title || null,
          email: email || null,
          phone: phone || null,
          telegram_username: telegram || null,
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

  return (
    <SlideOver open={open} onClose={onClose} title={name || contact.name}>
      <div className="space-y-4">
        {/* TG link if username exists */}
        {telegram && (
          <a
            href={`https://t.me/${telegram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-[#2AABEE] text-white px-4 py-2.5 text-sm font-medium transition hover:bg-[#2AABEE]/90 w-full"
          >
            <MessageCircle className="h-4 w-4" />
            Message on Telegram
          </a>
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
                <div>
                  <p className="text-xs text-foreground font-medium">{dup.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {[dup.email, dup.telegram_username && `@${dup.telegram_username}`, dup.company].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleMerge(dup.id)}
                  disabled={merging}
                  className="h-6 text-[10px] text-primary"
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
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Company</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1" />
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
