"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Plus, Trash2, Save, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";

type CustomField = {
  id?: string;
  field_name: string;
  label: string;
  field_type: string;
  options: string[] | null;
  required: boolean;
  position: number;
};

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "date", label: "Date" },
  { value: "url", label: "URL" },
  { value: "textarea", label: "Long Text" },
];

export default function ContactSettingsPage() {
  const [fields, setFields] = React.useState<CustomField[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/contacts/fields")
      .then((r) => r.json())
      .then((d) => setFields(d.fields ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function addField() {
    setFields((prev) => [
      ...prev,
      { field_name: "", label: "", field_type: "text", options: null, required: false, position: prev.length + 1 },
    ]);
  }

  function updateField(i: number, patch: Partial<CustomField>) {
    setFields((prev) => prev.map((f, idx) => {
      if (idx !== i) return f;
      const updated = { ...f, ...patch };
      if (patch.label && !f.id) {
        updated.field_name = patch.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      }
      return updated;
    }));
  }

  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveField(i: number, dir: -1 | 1) {
    setFields((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  async function saveFields() {
    setSaving(true);
    try {
      const res = await fetch("/api/contacts/fields", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (res.ok) {
        const data = await res.json();
        setFields(data.fields);
        toast.success("Contact fields saved");
      } else {
        toast.error("Failed to save fields");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="h-8 w-48 bg-white/[0.04] animate-pulse rounded-lg" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Contact Custom Fields</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add custom fields to contact forms. These appear in both the create modal and contact detail panel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={addField}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Field
          </Button>
          <Button size="sm" onClick={saveFields} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {fields.map((field, i) => (
          <div
            key={field.id ?? `new-${i}`}
            className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveField(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <GripVertical className="h-4 w-4 text-muted-foreground/50" />

              <Input
                value={field.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                placeholder="Field label (e.g. LinkedIn URL)"
                className="flex-1"
              />

              <Select
                value={field.field_type}
                onChange={(e) => updateField(i, { field_type: e.target.value })}
                options={FIELD_TYPES}
                className="w-32"
              />

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                  className="rounded border-white/10"
                />
                Required
              </label>

              <button onClick={() => removeField(i)} className="text-muted-foreground hover:text-red-400 transition">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {field.field_type === "select" && (
              <div className="ml-10">
                <Input
                  value={(field.options ?? []).join(", ")}
                  onChange={(e) =>
                    updateField(i, {
                      options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                    })
                  }
                  placeholder="Comma-separated options (e.g. Tier 1, Tier 2, Tier 3)"
                  className="text-xs"
                />
              </div>
            )}
          </div>
        ))}

        {fields.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
            No custom contact fields. The default form includes: Name, Company, Email, Phone, Telegram, etc.
            <br />
            Add fields here to extend it.
          </div>
        )}
      </div>
    </div>
  );
}
