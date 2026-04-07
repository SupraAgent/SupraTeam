"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  GripVertical,
  Plus,
  Trash2,
  Save,
  Palette,
  ChevronUp,
  ChevronDown,
  Clock,
  Sparkles,
} from "lucide-react";

const BD_MILESTONE_FIELDS: Omit<CustomField, "id" | "position">[] = [
  { field_name: "sdk_integrated", label: "SDK Integrated", field_type: "dropdown", options: ["Not Started", "In Progress", "Complete"], required: false, board_type: "BD" },
  { field_name: "testnet_deployed", label: "Testnet Deployed", field_type: "dropdown", options: ["Not Started", "In Progress", "Complete"], required: false, board_type: "BD" },
  { field_name: "mainnet_live", label: "Mainnet Live", field_type: "dropdown", options: ["Not Started", "In Progress", "Complete"], required: false, board_type: "BD" },
  { field_name: "audit_complete", label: "Audit Complete", field_type: "dropdown", options: ["Not Started", "In Progress", "Complete", "N/A"], required: false, board_type: "BD" },
  { field_name: "docs_published", label: "Documentation Published", field_type: "dropdown", options: ["Not Started", "Draft", "Published"], required: false, board_type: "BD" },
  { field_name: "partnership_type", label: "Partnership Type", field_type: "dropdown", options: ["Integration", "Co-Marketing", "Grant", "Investment", "Advisory", "Other"], required: false, board_type: null },
];

type Stage = {
  id?: string;
  name: string;
  position: number;
  color: string;
};

type CustomField = {
  id?: string;
  field_name: string;
  label: string;
  field_type: string;
  options: string[] | null;
  required: boolean;
  board_type: string | null;
  position: number;
};

const STAGE_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#3b82f6", "#06b6d4",
  "#10b981", "#0cce6b", "#f59e0b", "#ef4444", "#ec4899",
];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "date", label: "Date" },
  { value: "url", label: "URL" },
  { value: "textarea", label: "Long Text" },
];

export default function PipelineSettingsPage() {
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [fields, setFields] = React.useState<CustomField[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingStages, setSavingStages] = React.useState(false);
  const [savingFields, setSavingFields] = React.useState(false);
  const [stagesMsg, setStagesMsg] = React.useState("");
  const [fieldsMsg, setFieldsMsg] = React.useState("");

  type ReminderRule = { stage_id: string; remind_after_hours: number; message: string; is_active: boolean };
  const [reminderRules, setReminderRules] = React.useState<ReminderRule[]>([]);
  const [savingReminders, setSavingReminders] = React.useState(false);
  const [remindersMsg, setRemindersMsg] = React.useState("");

  React.useEffect(() => {
    async function load() {
      try {
        const [stagesRes, fieldsRes, rulesRes] = await Promise.all([
          fetch("/api/pipeline"),
          fetch("/api/pipeline/fields"),
          fetch("/api/reminders/rules").catch(() => null),
        ]);

        if (stagesRes.ok) {
          const data = await stagesRes.json();
          setStages(data.stages ?? []);
        }
        if (fieldsRes.ok) {
          const data = await fieldsRes.json();
          setFields(data.fields ?? []);
        }
        if (rulesRes?.ok) {
          const data = await rulesRes.json();
          setReminderRules((data.rules ?? []).map((r: Record<string, unknown>) => ({
            stage_id: r.stage_id as string,
            remind_after_hours: r.remind_after_hours as number,
            message: r.message as string,
            is_active: r.is_active as boolean,
          })));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // --- Stage helpers ---
  function moveStage(index: number, direction: -1 | 1) {
    const newStages = [...stages];
    const target = index + direction;
    if (target < 0 || target >= newStages.length) return;
    [newStages[index], newStages[target]] = [newStages[target], newStages[index]];
    setStages(newStages.map((s, i) => ({ ...s, position: i + 1 })));
  }

  function updateStage(index: number, updates: Partial<Stage>) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      {
        name: "",
        position: prev.length + 1,
        color: STAGE_COLORS[prev.length % STAGE_COLORS.length],
      },
    ]);
  }

  function removeStage(index: number) {
    setStages((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i + 1 })));
  }

  async function saveStages() {
    setSavingStages(true);
    setStagesMsg("");
    try {
      const res = await fetch("/api/pipeline/stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages }),
      });
      if (res.ok) {
        const data = await res.json();
        setStages(data.stages);
        setStagesMsg("Stages saved");
      } else {
        setStagesMsg("Failed to save");
      }
    } finally {
      setSavingStages(false);
      setTimeout(() => setStagesMsg(""), 3000);
    }
  }

  // --- Field helpers ---
  function addField() {
    setFields((prev) => [
      ...prev,
      {
        field_name: "",
        label: "",
        field_type: "text",
        options: null,
        required: false,
        board_type: null,
        position: prev.length + 1,
      },
    ]);
  }

  function updateField(index: number, updates: Partial<CustomField>) {
    setFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const updated = { ...f, ...updates };
        // Auto-generate field_name from label
        if (updates.label !== undefined) {
          updated.field_name = updates.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
        }
        return updated;
      })
    );
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, position: i + 1 })));
  }

  function moveField(index: number, direction: -1 | 1) {
    const newFields = [...fields];
    const target = index + direction;
    if (target < 0 || target >= newFields.length) return;
    [newFields[index], newFields[target]] = [newFields[target], newFields[index]];
    setFields(newFields.map((f, i) => ({ ...f, position: i + 1 })));
  }

  async function saveFields() {
    setSavingFields(true);
    setFieldsMsg("");
    try {
      const res = await fetch("/api/pipeline/fields", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (res.ok) {
        const data = await res.json();
        setFields(data.fields);
        setFieldsMsg("Fields saved");
      } else {
        setFieldsMsg("Failed to save");
      }
    } finally {
      setSavingFields(false);
      setTimeout(() => setFieldsMsg(""), 3000);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pipeline Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure pipeline stages and custom deal form fields.
        </p>
      </div>

      {/* --- Stages Section --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-foreground">Pipeline Stages</h2>
            <p className="text-xs text-muted-foreground">
              Add, remove, rename, and reorder stages. Changes apply to all boards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stagesMsg && (
              <span className="text-xs text-primary">{stagesMsg}</span>
            )}
            <Button size="sm" variant="ghost" onClick={addStage}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Stage
            </Button>
            <Button size="sm" onClick={saveStages} disabled={savingStages}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {savingStages ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {stages.map((stage, i) => (
            <div
              key={stage.id ?? `new-${i}`}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveStage(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveStage(i, 1)}
                  disabled={i === stages.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <GripVertical className="h-4 w-4 text-muted-foreground/50" />

              <div
                className="h-4 w-4 rounded-full shrink-0 border border-white/10"
                style={{ backgroundColor: stage.color }}
              />

              <Input
                value={stage.name}
                onChange={(e) => updateStage(i, { name: e.target.value })}
                placeholder="Stage name"
                className="flex-1"
              />

              <div className="flex items-center gap-1">
                {STAGE_COLORS.slice(0, 5).map((c) => (
                  <button
                    key={c}
                    onClick={() => updateStage(i, { color: c })}
                    className="h-5 w-5 rounded-full border border-white/10 transition hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: stage.color === c ? "2px solid white" : "none",
                      outlineOffset: "1px",
                    }}
                  />
                ))}
              </div>

              <span className="text-xs text-muted-foreground/50 w-6 text-center">{i + 1}</span>

              <button
                onClick={() => removeStage(i)}
                className="text-muted-foreground hover:text-red-400 transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {stages.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
              No stages defined. Add your first stage above.
            </div>
          )}
        </div>
      </section>

      {/* --- Custom Fields Section --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-foreground">Custom Deal Fields</h2>
            <p className="text-xs text-muted-foreground">
              Add custom fields to the Create Deal form. Optionally scope them to a specific board.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {fieldsMsg && (
              <span className="text-xs text-primary">{fieldsMsg}</span>
            )}
            <Button size="sm" variant="ghost" onClick={addField}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Field
            </Button>
            <Button size="sm" onClick={saveFields} disabled={savingFields}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {savingFields ? "Saving..." : "Save"}
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
                  <button
                    onClick={() => moveField(i, -1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveField(i, 1)}
                    disabled={i === fields.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <GripVertical className="h-4 w-4 text-muted-foreground/50" />

                <Input
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Field label (e.g. Campaign Name)"
                  className="flex-1"
                />

                <Select
                  value={field.field_type}
                  onChange={(e) => updateField(i, { field_type: e.target.value })}
                  options={FIELD_TYPES}
                  className="w-32"
                />

                <Select
                  value={field.board_type ?? ""}
                  onChange={(e) => updateField(i, { board_type: e.target.value || null })}
                  options={[
                    { value: "BD", label: "BD only" },
                    { value: "Marketing", label: "Marketing only" },
                    { value: "Admin", label: "Admin only" },
                  ]}
                  placeholder="All boards"
                  className="w-36"
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

                <button
                  onClick={() => removeField(i)}
                  className="text-muted-foreground hover:text-red-400 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {field.field_type === "select" && (
                <div className="ml-10">
                  <Input
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) =>
                      updateField(i, {
                        options: e.target.value
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Comma-separated options (e.g. High, Medium, Low)"
                    className="text-xs"
                  />
                </div>
              )}
            </div>
          ))}

          {fields.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
              No custom fields. The default deal form includes: Name, Board, Stage, Contact, and Value.
              <br />
              Add fields here to extend it.
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFields(BD_MILESTONE_FIELDS.map((f, i) => ({ ...f, position: i + 1 })));
                    setFieldsMsg("BD milestone fields loaded — click Save to apply");
                  }}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Load BD Milestone Fields
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* --- Stage Reminders Section --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              Stage Reminders
            </h2>
            <p className="text-xs text-muted-foreground">
              Get notified when deals sit in a stage too long. Configure per stage.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {remindersMsg && (
              <span className="text-xs text-primary">{remindersMsg}</span>
            )}
            <Button
              size="sm"
              onClick={async () => {
                setSavingReminders(true);
                setRemindersMsg("");
                try {
                  const res = await fetch("/api/reminders/rules", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rules: reminderRules }),
                  });
                  if (res.ok) {
                    setRemindersMsg("Reminders saved");
                  } else {
                    setRemindersMsg("Failed to save");
                  }
                } finally {
                  setSavingReminders(false);
                  setTimeout(() => setRemindersMsg(""), 3000);
                }
              }}
              disabled={savingReminders}
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              {savingReminders ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {stages.map((stage) => {
            const rule = reminderRules.find((r) => r.stage_id === stage.id);
            const hasRule = !!rule;

            return (
              <div
                key={`reminder-${stage.id}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5"
              >
                <div
                  className="h-3.5 w-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-sm text-foreground w-36 truncate">{stage.name}</span>

                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={hasRule ? rule.is_active : false}
                    onChange={(e) => {
                      if (!hasRule) {
                        setReminderRules((prev) => [...prev, {
                          stage_id: stage.id!,
                          remind_after_hours: 72,
                          message: "{deal} needs attention ({hours}h in stage)",
                          is_active: e.target.checked,
                        }]);
                      } else {
                        setReminderRules((prev) => prev.map((r) =>
                          r.stage_id === stage.id ? { ...r, is_active: e.target.checked } : r
                        ));
                      }
                    }}
                    className="rounded border-white/10"
                  />
                  Active
                </label>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-muted-foreground">After</span>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={rule?.remind_after_hours ?? 72}
                    onChange={(e) => {
                      const hours = parseInt(e.target.value) || 72;
                      if (!hasRule) {
                        setReminderRules((prev) => [...prev, {
                          stage_id: stage.id!,
                          remind_after_hours: hours,
                          message: "{deal} needs attention ({hours}h in stage)",
                          is_active: true,
                        }]);
                      } else {
                        setReminderRules((prev) => prev.map((r) =>
                          r.stage_id === stage.id ? { ...r, remind_after_hours: hours } : r
                        ));
                      }
                    }}
                    className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground outline-none"
                  />
                  <span className="text-[11px] text-muted-foreground">hours</span>
                </div>

                <Input
                  value={rule?.message ?? "{deal} needs attention ({hours}h in stage)"}
                  onChange={(e) => {
                    if (!hasRule) {
                      setReminderRules((prev) => [...prev, {
                        stage_id: stage.id!,
                        remind_after_hours: 72,
                        message: e.target.value,
                        is_active: true,
                      }]);
                    } else {
                      setReminderRules((prev) => prev.map((r) =>
                        r.stage_id === stage.id ? { ...r, message: e.target.value } : r
                      ));
                    }
                  }}
                  placeholder="Message template ({deal}, {hours})"
                  className="flex-1 text-xs"
                />
              </div>
            );
          })}

          {stages.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
              Add pipeline stages above first, then configure reminders for each.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
