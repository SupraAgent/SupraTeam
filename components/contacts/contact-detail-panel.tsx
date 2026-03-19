"use client";

import * as React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { Contact, PipelineStage } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { Save, Trash2, MessageCircle, FileText } from "lucide-react";
import Link from "next/link";

type ContactDetailPanelProps = {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated?: () => void;
};

export function ContactDetailPanel({ contact, open, onClose, onDeleted, onUpdated }: ContactDetailPanelProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [telegram, setTelegram] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [linkedDocs, setLinkedDocs] = React.useState<{ id: string; title: string; updated_at: string }[]>([]);

  React.useEffect(() => {
    if (contact && open) {
      setName(contact.name);
      setCompany(contact.company ?? "");
      setTitle(contact.title ?? "");
      setEmail(contact.email ?? "");
      setPhone(contact.phone ?? "");
      setTelegram(contact.telegram_username ?? "");
      setStageId(contact.stage_id ?? "");
      setNotes(contact.notes ?? "");

      fetch("/api/pipeline").then((r) => r.json()).then((d) => setStages(d.stages ?? [])).catch(() => {});
      fetch(`/api/docs?entity_type=contact&entity_id=${contact.id}`).then((r) => r.json()).then((d) => setLinkedDocs(d.docs ?? [])).catch(() => setLinkedDocs([]));
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
          notes: notes || null,
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
          <label className="text-[11px] font-medium text-muted-foreground">Stage</label>
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
