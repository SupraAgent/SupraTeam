"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { PipelineStage, Contact } from "@/lib/types";

type CustomField = {
  id: string;
  field_name: string;
  label: string;
  field_type: string;
  options: string[] | null;
  required: boolean;
  board_type: string | null;
  position: number;
};

type CreateDealModalProps = {
  open: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  contacts: Contact[];
  onCreated: () => void;
};

export function CreateDealModal({ open, onClose, stages, contacts, onCreated }: CreateDealModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [dealName, setDealName] = React.useState("");
  const [boardType, setBoardType] = React.useState("BD");
  const [stageId, setStageId] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [value, setValue] = React.useState("");
  const [customFields, setCustomFields] = React.useState<CustomField[]>([]);
  const [customValues, setCustomValues] = React.useState<Record<string, string>>({});

  // Fetch custom fields
  React.useEffect(() => {
    if (open) {
      fetch("/api/pipeline/fields")
        .then((r) => r.json())
        .then((data) => setCustomFields(data.fields ?? []))
        .catch(() => {});
    }
  }, [open]);

  React.useEffect(() => {
    if (open && stages.length > 0 && !stageId) {
      setStageId(stages[0].id);
    }
  }, [open, stages, stageId]);

  // Filter custom fields by board type
  const activeCustomFields = customFields.filter(
    (f) => !f.board_type || f.board_type === boardType
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dealName || !stageId) return;

    // Validate required custom fields
    for (const field of activeCustomFields) {
      if (field.required && !customValues[field.id]) return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_name: dealName,
          board_type: boardType,
          stage_id: stageId,
          contact_id: contactId || null,
          value: value ? Number(value) : null,
          custom_fields: customValues,
        }),
      });

      if (res.ok) {
        setDealName("");
        setBoardType("BD");
        setStageId(stages[0]?.id ?? "");
        setContactId("");
        setValue("");
        setCustomValues({});
        onCreated();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  function renderCustomField(field: CustomField) {
    const val = customValues[field.id] ?? "";

    switch (field.field_type) {
      case "select":
        return (
          <Select
            value={val}
            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
            placeholder="Select..."
            className="mt-1"
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={val}
            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            placeholder="0"
            className="mt-1"
          />
        );
      case "date":
        return (
          <Input
            type="date"
            value={val}
            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            className="mt-1"
          />
        );
      case "url":
        return (
          <Input
            type="url"
            value={val}
            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            placeholder="https://..."
            className="mt-1"
          />
        );
      case "textarea":
        return (
          <textarea
            value={val}
            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            placeholder={field.label}
            rows={3}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition hover:border-white/15 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 resize-none"
          />
        );
      default:
        return (
          <Input
            value={val}
            onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            placeholder={field.label}
            className="mt-1"
          />
        );
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Deal">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Deal Name *</label>
          <Input
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
            placeholder="e.g. Acme Inc Partnership"
            className="mt-1"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Board *</label>
            <Select
              value={boardType}
              onChange={(e) => setBoardType(e.target.value)}
              options={[
                { value: "BD", label: "BD" },
                { value: "Marketing", label: "Marketing" },
                { value: "Admin", label: "Admin" },
              ]}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Stage *</label>
            <Select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Contact</label>
            <Select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              options={contacts.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="None"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Value ($)</label>
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
        </div>

        {/* Dynamic custom fields */}
        {activeCustomFields.length > 0 && (
          <div className="border-t border-white/10 pt-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Custom Fields
            </p>
            {activeCustomFields.map((field) => (
              <div key={field.id}>
                <label className="text-xs font-medium text-muted-foreground">
                  {field.label}
                  {field.required && " *"}
                </label>
                {renderCustomField(field)}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !dealName || !stageId}>
            {loading ? "Creating..." : "Create Deal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
