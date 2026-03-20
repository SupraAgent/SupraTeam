"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { PipelineStage, LifecycleStage, ContactSource } from "@/lib/types";

type Duplicate = { id: string; name: string; email: string | null; company: string | null; telegram_username: string | null; phone: string | null; title: string | null; confidence: number; signals: string[] };

type CreateContactModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const LIFECYCLE_OPTIONS: { value: LifecycleStage; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "lead", label: "Lead" },
  { value: "opportunity", label: "Opportunity" },
  { value: "customer", label: "Customer" },
];

const SOURCE_OPTIONS: { value: ContactSource; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "referral", label: "Referral" },
  { value: "event", label: "Event" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
];

export function CreateContactModal({ open, onClose, onCreated }: CreateContactModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [telegram, setTelegram] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [tgGroupLink, setTgGroupLink] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [lifecycle, setLifecycle] = React.useState<LifecycleStage>("prospect");
  const [source, setSource] = React.useState<ContactSource>("manual");
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [duplicates, setDuplicates] = React.useState<Duplicate[]>([]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(null);

  // Custom fields
  type CField = { id: string; label: string; field_type: string; options: string[] | null; required: boolean };
  const [customFields, setCustomFields] = React.useState<CField[]>([]);
  const [customValues, setCustomValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      Promise.all([
        fetch("/api/pipeline").then((r) => r.json()).then((data) => {
          setStages(data.stages ?? []);
          if (data.stages?.length > 0 && !stageId) {
            setStageId(data.stages[0].id);
          }
        }).catch(() => {}),
        fetch("/api/contacts/fields").then((r) => r.json()).then((d) => setCustomFields(d.fields ?? [])).catch(() => {}),
      ]);
    }
  }, [open, stageId]);

  // Debounced duplicate check
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!name && !email && !telegram) { setDuplicates([]); return; }

    debounceRef.current = setTimeout(async () => {
      const params = new URLSearchParams();
      if (name.length >= 2) params.set("name", name);
      if (email) params.set("email", email);
      if (telegram) params.set("telegram", telegram);
      if (params.toString()) {
        const res = await fetch(`/api/contacts/duplicates?${params}`);
        if (res.ok) {
          const { duplicates } = await res.json();
          setDuplicates(duplicates ?? []);
        }
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [name, email, telegram]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (email && !email.includes("@")) { toast.error("Invalid email address"); return; }
    setLoading(true);

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company || null,
          email: email || null,
          phone: phone || null,
          telegram_username: telegram || null,
          title: title || null,
          notes: notes ? (tgGroupLink ? `${notes}\nTG Group: ${tgGroupLink}` : notes) : (tgGroupLink ? `TG Group: ${tgGroupLink}` : null),
          stage_id: stageId || null,
          lifecycle_stage: lifecycle,
          source,
          custom_fields: customValues,
        }),
      });

      if (res.ok) {
        toast.success("Contact added");
        setName(""); setCompany(""); setEmail(""); setPhone("");
        setTelegram(""); setTitle(""); setNotes(""); setLifecycle("prospect");
        setSource("manual"); setStageId(stages[0]?.id ?? ""); setDuplicates([]); setCustomValues({});
        onCreated();
        onClose();
      } else {
        toast.error("Failed to add contact");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Contact">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Duplicate warning */}
        {duplicates.length > 0 && (() => {
          const highConfidence = duplicates.some((d) => d.confidence >= 75);
          return (
            <div className={`rounded-lg border p-2.5 ${highConfidence ? "border-red-400/30 bg-red-500/5" : "border-amber-400/30 bg-amber-500/5"}`}>
              <div className={`flex items-center gap-1.5 text-xs font-medium mb-1.5 ${highConfidence ? "text-red-400" : "text-amber-400"}`}>
                {highConfidence ? <ShieldAlert className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3 w-3" />}
                {highConfidence ? "Likely duplicate — review before creating" : "Possible duplicates found"}
              </div>
              {duplicates.slice(0, 4).map((dup) => (
                <div key={dup.id} className="flex items-center justify-between text-[11px] py-1">
                  <div className="text-muted-foreground">
                    <span className="text-foreground font-medium">{dup.name}</span>
                    {dup.email && <span className="ml-1.5">{dup.email}</span>}
                    {dup.telegram_username && <span className="ml-1.5 text-primary">@{dup.telegram_username}</span>}
                    {dup.company && <span className="ml-1.5 text-muted-foreground/50">{dup.company}</span>}
                  </div>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ml-2 shrink-0 ${
                    dup.confidence >= 75 ? "bg-red-500/20 text-red-400" :
                    dup.confidence >= 50 ? "bg-amber-500/20 text-amber-400" :
                    "bg-blue-500/20 text-blue-400"
                  }`}>
                    {dup.confidence}%
                  </span>
                </div>
              ))}
              {duplicates.length > 4 && <p className="text-[10px] text-muted-foreground/50 mt-1">+{duplicates.length - 4} more</p>}
            </div>
          );
        })()}

        <div>
          <label className="text-xs font-medium text-muted-foreground">Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="mt-1" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890" className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Telegram Username</label>
            <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="username (without @)" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">TG Group Link</label>
            <Input value={tgGroupLink} onChange={(e) => setTgGroupLink(e.target.value)} placeholder="https://t.me/+abc123" className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Stage</label>
            <Select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="No stage"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Lifecycle</label>
            <Select
              value={lifecycle}
              onChange={(e) => setLifecycle(e.target.value as LifecycleStage)}
              options={LIFECYCLE_OPTIONS}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Source</label>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as ContactSource)}
              options={SOURCE_OPTIONS}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes about this contact..." className="mt-1 min-h-[80px]" />
        </div>

        {/* Custom fields */}
        {customFields.length > 0 && (
          <div className="space-y-3 pt-1 border-t border-white/10">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider pt-2">Custom Fields</p>
            {customFields.map((field) => (
              <div key={field.id}>
                <label className="text-xs font-medium text-muted-foreground">
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

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading || !name}>
            {loading ? "Adding..." : "Add Contact"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
