"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { GitMerge, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MergeContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_username: string | null;
  company: string | null;
  title: string | null;
};

type MergePreviewModalProps = {
  open: boolean;
  onClose: () => void;
  contacts: MergeContact[];
  confidence: number;
  signals: string[];
  onMerged: () => void;
};

const FIELDS: { key: keyof MergeContact; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "telegram_username", label: "Telegram" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
];

export function MergePreviewModal({ open, onClose, contacts, confidence, signals, onMerged }: MergePreviewModalProps) {
  const [primaryId, setPrimaryId] = React.useState(contacts[0]?.id ?? "");
  const [fieldChoices, setFieldChoices] = React.useState<Record<string, string>>({});
  const [merging, setMerging] = React.useState(false);

  // Reset when contacts change
  React.useEffect(() => {
    if (contacts.length > 0) {
      setPrimaryId(contacts[0].id);
      // Auto-select best value for each field (prefer non-null from primary, then others)
      const choices: Record<string, string> = {};
      for (const field of FIELDS) {
        const primary = contacts[0];
        if (primary[field.key]) {
          choices[field.key] = primary.id;
        } else {
          const other = contacts.find((c) => c[field.key]);
          if (other) choices[field.key] = other.id;
        }
      }
      setFieldChoices(choices);
    }
  }, [contacts]);

  const primary = contacts.find((c) => c.id === primaryId) ?? contacts[0];
  const others = contacts.filter((c) => c.id !== primaryId);

  async function handleMerge() {
    setMerging(true);
    try {
      // Build field overrides from choices
      const overrides: Record<string, unknown> = {};
      for (const field of FIELDS) {
        const chosenContactId = fieldChoices[field.key];
        if (chosenContactId && chosenContactId !== primaryId) {
          const chosenContact = contacts.find((c) => c.id === chosenContactId);
          if (chosenContact?.[field.key]) {
            overrides[field.key] = chosenContact[field.key];
          }
        }
      }

      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryId,
          mergeIds: others.map((c) => c.id),
          fieldOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        }),
      });

      if (res.ok) {
        toast.success(`Merged ${contacts.length} contacts into ${primary.name}`);
        onMerged();
        onClose();
      } else {
        toast.error("Merge failed");
      }
    } finally {
      setMerging(false);
    }
  }

  if (contacts.length < 2) return null;

  return (
    <Modal open={open} onClose={onClose} title="Merge Preview" className="max-w-2xl">
      <div className="space-y-4">
        {/* Confidence badge */}
        <div className="flex items-center gap-2">
          <span className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            confidence >= 80 ? "bg-red-500/20 text-red-400" :
            confidence >= 60 ? "bg-amber-500/20 text-amber-400" :
            "bg-blue-500/20 text-blue-400"
          )}>
            {confidence}% match
          </span>
          <span className="text-[10px] text-muted-foreground">
            {signals.map((s) => s.replace(/_/g, " ")).join(", ")}
          </span>
        </div>

        {/* Primary selector */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">Keep as primary record:</p>
          <div className="flex gap-2">
            {contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => setPrimaryId(c.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
                  c.id === primaryId
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/10 text-muted-foreground hover:border-white/20"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Field-by-field comparison */}
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="grid gap-0 divide-y divide-white/5">
            {FIELDS.map((field) => {
              const values = contacts.map((c) => ({ id: c.id, value: c[field.key] as string | null }));
              const uniqueValues = [...new Set(values.map((v) => v.value).filter(Boolean))];
              const hasConflict = uniqueValues.length > 1;
              const selectedId = fieldChoices[field.key];

              return (
                <div key={field.key} className={cn("grid grid-cols-[100px_1fr] gap-0", hasConflict && "bg-amber-500/[0.03]")}>
                  <div className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground flex items-center">
                    {field.label}
                    {hasConflict && <span className="ml-1 text-amber-400">*</span>}
                  </div>
                  <div className="px-3 py-2 flex flex-wrap gap-1.5">
                    {values.map((v) => {
                      if (!v.value) return null;
                      const isSelected = selectedId === v.id;
                      const isPrimary = v.id === primaryId;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setFieldChoices((prev) => ({ ...prev, [field.key]: v.id }))}
                          className={cn(
                            "rounded-md px-2 py-1 text-xs transition-colors flex items-center gap-1",
                            isSelected
                              ? "bg-primary/15 text-primary border border-primary/30"
                              : "bg-white/5 text-foreground/70 border border-white/10 hover:border-white/20"
                          )}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5" />}
                          {field.key === "telegram_username" ? `@${v.value}` : v.value}
                          {isPrimary && <span className="text-[9px] text-muted-foreground/50 ml-1">(primary)</span>}
                        </button>
                      );
                    })}
                    {uniqueValues.length === 0 && (
                      <span className="text-[11px] text-muted-foreground/30 italic">empty</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          {others.length} contact{others.length !== 1 ? "s" : ""} will be merged into the primary. Deals will be reassigned. Notes will be combined.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleMerge} disabled={merging}>
            <GitMerge className="h-3.5 w-3.5 mr-1" />
            {merging ? "Merging..." : `Merge ${contacts.length} Contacts`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
