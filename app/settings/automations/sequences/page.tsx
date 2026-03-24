"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { EmailSequence, EmailTemplate, SequenceStep } from "@/lib/email/types";
import { toast } from "sonner";

export default function SequencesPage() {
  const [sequences, setSequences] = React.useState<EmailSequence[]>([]);
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editingSeq, setEditingSeq] = React.useState<Partial<EmailSequence> | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const [seqRes, tplRes] = await Promise.all([
        fetch("/api/email/sequences"),
        fetch("/api/email/templates"),
      ]);
      const [seqJson, tplJson] = await Promise.all([seqRes.json(), tplRes.json()]);
      setSequences(seqJson.data ?? []);
      setTemplates(tplJson.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchData(); }, []);

  function openCreate() {
    setEditingSeq({
      name: "",
      description: "",
      steps: [{ delay_days: 0, template_id: "", subject_override: "" }],
      board_type: null,
      is_active: true,
    });
    setEditModalOpen(true);
  }

  function openEdit(seq: EmailSequence) {
    setEditingSeq({ ...seq });
    setEditModalOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sequence?")) return;
    await fetch(`/api/email/sequences?id=${id}`, { method: "DELETE" });
    toast("Sequence deleted");
    fetchData();
  }

  async function handleSave() {
    if (!editingSeq?.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!editingSeq.steps?.length || editingSeq.steps.some((s) => !s.template_id)) {
      toast.error("All steps need a template");
      return;
    }

    const res = await fetch("/api/email/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingSeq),
    });

    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }

    toast(editingSeq.id ? "Sequence updated" : "Sequence created");
    setEditModalOpen(false);
    fetchData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Email Sequences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-step outreach campaigns. Enroll contacts from deal pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/settings/automations/sequences/analytics"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
          >
            Analytics
          </a>
          <Button size="sm" onClick={openCreate}>
            New Sequence
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : sequences.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
            <SequenceIcon className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No sequences yet</p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Create a sequence to automate multi-step email outreach.
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              Create First Sequence
            </Button>
          </div>
        ) : (
          sequences.map((seq) => (
            <div
              key={seq.id}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">{seq.name}</h3>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${seq.is_active ? "bg-green-500/10 text-green-400" : "bg-white/5 text-muted-foreground"}`}>
                      {seq.is_active ? "Active" : "Paused"}
                    </span>
                    {seq.board_type && (
                      <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                        {seq.board_type}
                      </span>
                    )}
                  </div>
                  {seq.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{seq.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(seq)} className="text-xs text-primary hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(seq.id)} className="text-xs text-red-400 hover:underline">
                    Delete
                  </button>
                </div>
              </div>

              {/* Steps preview */}
              <div className="mt-3 flex items-center gap-1 flex-wrap">
                {seq.steps.map((step, i) => {
                  const tpl = templates.find((t) => t.id === step.template_id);
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <span className="text-[10px] text-muted-foreground/40 mx-0.5">
                          → {step.delay_days}d →
                        </span>
                      )}
                      <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] text-foreground/80">
                        {tpl?.name ?? `Step ${i + 1}`}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit/Create modal */}
      <Modal
        open={editModalOpen}
        title={editingSeq?.id ? "Edit Sequence" : "New Sequence"}
        onClose={() => setEditModalOpen(false)}
        className="max-w-xl"
      >
        {editingSeq && (
          <SequenceEditor
            sequence={editingSeq}
            templates={templates}
            onChange={setEditingSeq}
            onSave={handleSave}
            onCancel={() => setEditModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}

function SequenceEditor({
  sequence,
  templates,
  onChange,
  onSave,
  onCancel,
}: {
  sequence: Partial<EmailSequence>;
  templates: EmailTemplate[];
  onChange: (seq: Partial<EmailSequence>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const steps = sequence.steps ?? [];

  function updateStep(index: number, update: Partial<SequenceStep>) {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...update };
    onChange({ ...sequence, steps: newSteps });
  }

  function addStep() {
    onChange({
      ...sequence,
      steps: [...steps, { delay_days: 3, template_id: "", subject_override: "" }],
    });
  }

  function removeStep(index: number) {
    onChange({ ...sequence, steps: steps.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[10px] text-muted-foreground mb-1">Name</label>
        <Input
          value={sequence.name ?? ""}
          onChange={(e) => onChange({ ...sequence, name: e.target.value })}
          placeholder="e.g. BD Cold Outreach"
          className="text-xs"
        />
      </div>

      <div>
        <label className="block text-[10px] text-muted-foreground mb-1">Description</label>
        <Input
          value={sequence.description ?? ""}
          onChange={(e) => onChange({ ...sequence, description: e.target.value })}
          placeholder="Optional description"
          className="text-xs"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-[10px] text-muted-foreground mb-1">Board</label>
          <select
            value={sequence.board_type ?? ""}
            onChange={(e) => onChange({ ...sequence, board_type: e.target.value || null })}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="">All boards</option>
            <option value="BD">BD</option>
            <option value="Marketing">Marketing</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sequence.is_active ?? true}
            onChange={(e) => onChange({ ...sequence, is_active: e.target.checked })}
            className="rounded"
          />
          <span className="text-xs text-foreground">Active</span>
        </label>
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Steps</label>
          <button onClick={addStep} className="text-[10px] text-primary hover:underline">
            + Add step
          </button>
        </div>

        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
              <span className="text-[10px] text-muted-foreground/50 shrink-0 w-6">#{i + 1}</span>

              {i > 0 && (
                <div className="shrink-0">
                  <label className="text-[9px] text-muted-foreground">Wait</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={step.delay_days}
                      onChange={(e) => updateStep(i, { delay_days: parseInt(e.target.value) || 0 })}
                      className="w-12 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-foreground outline-none"
                    />
                    <span className="text-[9px] text-muted-foreground">days</span>
                  </div>
                </div>
              )}

              <div className="flex-1">
                <label className="text-[9px] text-muted-foreground">Template</label>
                <select
                  value={step.template_id}
                  onChange={(e) => updateStep(i, { template_id: e.target.value })}
                  className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground outline-none"
                >
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="text-[9px] text-muted-foreground">Subject override</label>
                <input
                  value={step.subject_override ?? ""}
                  onChange={(e) => updateStep(i, { subject_override: e.target.value })}
                  placeholder="Optional"
                  className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground outline-none"
                />
              </div>

              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(i)}
                  className="text-muted-foreground/50 hover:text-red-400 transition shrink-0"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSave}>
          {sequence.id ? "Update" : "Create"} Sequence
        </Button>
      </div>
    </div>
  );
}

function SequenceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20M17 7l-5 5-5-5" />
    </svg>
  );
}
